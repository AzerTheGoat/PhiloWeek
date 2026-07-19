const express = require('express')
const router = express.Router()
const multer = require('multer')
const JSZip = require('jszip')
const matter = require('gray-matter')
const fs = require('fs')
const path = require('path')
const { getDb, updateTags } = require('../db')
const { v4: uuidv4 } = require('uuid')
const { ROADTRIP_PHOTOS_DIR } = require('../paths')
const { xlsxBufferToSpreadsheetContent } = require('../spreadsheetXlsx')

const ROADTRIP_PHOTO_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' }

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

router.post('/obsidian', upload.single('vault'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const db = getDb()
  const conflict = req.body.conflict || 'rename'
  const report = { imported: 0, skipped: 0, linksResolved: 0, linksBroken: 0, errors: [] }

  try {
    const zip = await JSZip.loadAsync(req.file.buffer)

    // Phase 1: collect supported entries (sorted shallowest first)
    const importEntries = []
    const roadtripPhotoEntries = []
    zip.forEach((relativePath, entry) => {
      if (entry.dir || relativePath.startsWith('__MACOSX')) return
      if (/^_Opuscule\/roadtrip-photos\/[^/]+\.(jpe?g|webp|png)$/i.test(relativePath)) {
        roadtripPhotoEntries.push({ relativePath, entry })
      } else if (/\.(md|json|xlsx)$/i.test(relativePath)) {
        importEntries.push({ relativePath, entry })
      }
    })
    importEntries.sort((a, b) => a.relativePath.split('/').length - b.relativePath.split('/').length)

    // Décompresse les binaires photos des road trips (clé = nom de fichier d'origine).
    const roadtripPhotoBuffers = new Map()
    for (const { relativePath, entry } of roadtripPhotoEntries) {
      try {
        roadtripPhotoBuffers.set(relativePath.split('/').pop(), await entry.async('nodebuffer'))
      } catch (err) {
        report.errors.push(`${relativePath}: ${err.message}`)
      }
    }

    // Phase 2: decompress all files asynchronously (before touching the DB)
    const decompressed = []
    for (const { relativePath, entry } of importEntries) {
      try {
        const rawContent = /\.xlsx$/i.test(relativePath)
          ? await xlsxBufferToSpreadsheetContent(await entry.async('nodebuffer'), relativePath.split('/').pop().replace(/\.xlsx$/i, ''))
          : await entry.async('text')
        decompressed.push({ relativePath, rawContent })
      } catch (err) {
        report.errors.push(`${relativePath}: ${err.message}`)
      }
    }

    // Phase 3: all DB writes in a single transaction (fast)
    const pathToId = {}
    let fileHistoryPayload = null
    let trashPayload = null
    let sharePayload = null
    let spreadsheetMetadataPayload = null
    let roadTripsPayload = null
    const roadtripPhotoWrites = [] // { filename, buffer } écrits sur disque après la transaction

    const importTx = db.transaction(() => {
      const insertFolder = db.prepare(
        "INSERT INTO files (id, parent_id, name, type, user_id, created_at, updated_at) VALUES (?, ?, ?, 'folder', ?, datetime('now'), datetime('now'))"
      )
      const insertFile = db.prepare(
        "INSERT INTO files (id, parent_id, name, type, content, user_id, last_edited_by, created_at, updated_at) VALUES (?, ?, ?, 'file', ?, ?, ?, datetime('now'), datetime('now'))"
      )
      const updateFile = db.prepare(
        "UPDATE files SET content = ?, history_revision = 0, content_version = content_version + 1, last_edited_by = ?, updated_at = datetime('now') WHERE id = ?"
      )
      const insertQuote = db.prepare(
        `INSERT INTO quotes (id, quote, author, source, notes, tags, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertFactCheck = db.prepare(
        `INSERT INTO fact_checks (id, claim, status, notes, source, tags, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertTodo = db.prepare(
        `INSERT OR IGNORE INTO todos (
          id, title, notes, status, due_at, user_id, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertPractice = db.prepare(
        `INSERT OR IGNORE INTO agenda_practices (
          id, title, color, active, user_id, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertAgendaCheck = db.prepare(
        `INSERT OR REPLACE INTO agenda_checks (
          practice_id, entry_date, done, user_id, updated_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      const upsertLifeProfile = db.prepare(
        `INSERT INTO life_profiles (user_id, birth_date, life_expectancy_years, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id)
         DO UPDATE SET birth_date = excluded.birth_date, life_expectancy_years = excluded.life_expectancy_years, updated_at = excluded.updated_at`
      )
      const insertQuestionnaireResult = db.prepare(
        `INSERT OR IGNORE INTO questionnaire_results (
          id, question_key, questionnaire_file_id, questionnaire_title, question_id,
          question_text, answer_text, expected_answer, correct, score, response_ms, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertHistoricalEvent = db.prepare(
        `INSERT OR IGNORE INTO historical_events (
          id, title, start_label, start_year, start_month, start_day,
          end_label, end_year, end_month, end_day, description, category, color,
          image_data, image_caption, tags, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertArticle = db.prepare(
        `INSERT OR IGNORE INTO articles (
          id, title, excerpt, content, status, published_on, published_at,
          cover_image_data, tags, event_id, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertArticleComment = db.prepare(
        `INSERT OR IGNORE INTO article_comments (
          id, article_id, body, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      const insertArticleReaction = db.prepare(
        `INSERT OR IGNORE INTO article_reactions (
          article_id, user_id, reaction, created_at
        ) VALUES (?, ?, 'like', ?)`
      )
      const insertArticleRead = db.prepare(
        `INSERT OR IGNORE INTO article_reads (
          id, article_id, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      const insertRevision = db.prepare(`
        INSERT OR IGNORE INTO file_revisions (file_id, user_id, revision_no, content, created_at, actor_user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const insertTrashedFile = db.prepare(`
        INSERT INTO files (
          id, parent_id, name, type, content, password_hash, encrypted_content,
          created_at, updated_at, sort_order, user_id, deleted_at, history_revision,
          content_version, last_edited_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const { relativePath, rawContent } of decompressed) {
        try {
          const jsonSpecial = safeJson(rawContent)
          const parsedSpecial = /\.md$/i.test(relativePath) ? safeMatter(rawContent) : { data: {}, content: rawContent }
          if (jsonSpecial?.philoweek_type === 'file_history') {
            fileHistoryPayload = jsonSpecial
            continue
          }
          if (jsonSpecial?.philoweek_type === 'trash') {
            trashPayload = jsonSpecial
            continue
          }
          if (jsonSpecial?.philoweek_type === 'file_shares') {
            sharePayload = jsonSpecial
            continue
          }
          if (jsonSpecial?.philoweek_type === 'spreadsheet_metadata') {
            spreadsheetMetadataPayload = jsonSpecial
            continue
          }
          if (jsonSpecial?.philoweek_type === 'road_trips') {
            roadTripsPayload = jsonSpecial
            continue
          }
          if (jsonSpecial?.philoweek_type === 'questionnaire_results') {
            const results = Array.isArray(jsonSpecial.results) ? jsonSpecial.results : []
            for (const result of results) {
              if (!result.question_key || !result.question_text) continue
              insertQuestionnaireResult.run(
                result.id || uuidv4(),
                String(result.question_key),
                result.questionnaire_file_id || null,
                result.questionnaire_title || null,
                result.question_id || null,
                String(result.question_text),
                result.answer_text || '',
                result.expected_answer || '',
                result.correct ? 1 : 0,
                Number.isFinite(Number(result.score)) ? Number(result.score) : (result.correct ? 1 : 0),
                Number.isFinite(Number(result.response_ms)) ? Number(result.response_ms) : null,
                req.user.id,
                result.created_at || new Date().toISOString()
              )
              report.imported++
            }
            continue
          }

          if (jsonSpecial?.philoweek_type === 'historical_timeline') {
            const events = Array.isArray(jsonSpecial.events) ? jsonSpecial.events : []
            const now = new Date().toISOString()
            for (const event of events) {
              if (!event.title || !Number.isFinite(Number(event.start_year))) continue
              insertHistoricalEvent.run(
                event.id || uuidv4(),
                String(event.title).trim(),
                String(event.start_label || event.start_year).trim(),
                Math.round(Number(event.start_year)),
                nullableInt(event.start_month, 1, 12),
                nullableInt(event.start_day, 1, 31),
                event.end_label ? String(event.end_label).trim() : null,
                nullableInt(event.end_year, -999999, 999999),
                nullableInt(event.end_month, 1, 12),
                nullableInt(event.end_day, 1, 31),
                event.description || null,
                event.category || null,
                normalizeColor(event.color),
                normalizeImage(event.image_data),
                event.image_caption || null,
                normalizeJsonArray(event.tags),
                req.user.id,
                normalizeIsoDate(event.created_at) || now,
                normalizeIsoDate(event.updated_at) || now
              )
              report.imported++
            }
            continue
          }

          if (jsonSpecial?.philoweek_type === 'social_journal') {
            const now = new Date().toISOString()
            const articles = Array.isArray(jsonSpecial.articles) ? jsonSpecial.articles : []
            const importedArticleIds = new Set()
            for (const article of articles) {
              const title = String(article.title || '').trim()
              const content = String(article.content || '').trim()
              if (!title || !content) continue
              const id = article.id || uuidv4()
              const status = article.status === 'published' ? 'published' : 'draft'
              const eventId = article.event_id && db.prepare('SELECT 1 FROM historical_events WHERE id = ?').get(article.event_id)
                ? article.event_id
                : null
              insertArticle.run(
                id,
                title,
                article.excerpt || null,
                content,
                status,
                normalizeDueDate(article.published_on) || now.slice(0, 10),
                status === 'published' ? (normalizeIsoDate(article.published_at) || now) : null,
                normalizeImage(article.cover_image_data),
                normalizeJsonArray(article.tags),
                eventId,
                req.user.id,
                normalizeIsoDate(article.created_at) || now,
                normalizeIsoDate(article.updated_at) || now
              )
              importedArticleIds.add(id)
              report.imported++
            }

            const comments = Array.isArray(jsonSpecial.comments) ? jsonSpecial.comments : []
            for (const comment of comments) {
              const body = String(comment.body || '').trim()
              if (!comment.article_id || !body) continue
              const articleExists = importedArticleIds.has(comment.article_id) ||
                db.prepare('SELECT 1 FROM articles WHERE id = ?').get(comment.article_id)
              if (!articleExists) continue
              insertArticleComment.run(
                comment.id || uuidv4(),
                comment.article_id,
                body.slice(0, 2000),
                req.user.id,
                normalizeIsoDate(comment.created_at) || now,
                normalizeIsoDate(comment.updated_at) || now
              )
              report.imported++
            }

            const reactions = Array.isArray(jsonSpecial.reactions) ? jsonSpecial.reactions : []
            for (const reaction of reactions) {
              if (!reaction.article_id) continue
              const articleExists = importedArticleIds.has(reaction.article_id) ||
                db.prepare('SELECT 1 FROM articles WHERE id = ?').get(reaction.article_id)
              if (!articleExists) continue
              insertArticleReaction.run(
                reaction.article_id,
                req.user.id,
                normalizeIsoDate(reaction.created_at) || now
              )
              report.imported++
            }

            const reads = Array.isArray(jsonSpecial.reads) ? jsonSpecial.reads : []
            for (const read of reads) {
              if (!read.article_id) continue
              const articleExists = importedArticleIds.has(read.article_id) ||
                db.prepare('SELECT 1 FROM articles WHERE id = ?').get(read.article_id)
              if (!articleExists) continue
              insertArticleRead.run(
                read.id || uuidv4(),
                read.article_id,
                req.user.id,
                normalizeIsoDate(read.created_at) || now,
                normalizeIsoDate(read.updated_at) || now
              )
              report.imported++
            }
            continue
          }

          if (jsonSpecial?.philoweek_type === 'todos') {
            const todos = Array.isArray(jsonSpecial.todos) ? jsonSpecial.todos : []
            for (const todo of todos) {
              const title = String(todo.title || '').trim()
              const dueAt = normalizeDueDate(todo.due_at)
              if (!title || !dueAt) continue
              const status = todo.status === 'done' ? 'done' : 'open'
              const now = new Date().toISOString()
              insertTodo.run(
                todo.id || uuidv4(),
                title,
                todo.notes || null,
                status,
                dueAt,
                req.user.id,
                todo.created_at || now,
                todo.updated_at || now,
                status === 'done' ? (todo.completed_at || now) : null
              )
              report.imported++
            }
            continue
          }

          if (jsonSpecial?.philoweek_type === 'dashboard') {
            const now = new Date().toISOString()
            const practices = Array.isArray(jsonSpecial.practices) ? jsonSpecial.practices : []
            const knownPracticeIds = new Set()
            for (const practice of practices) {
              const title = String(practice.title || '').trim()
              if (!title) continue
              const id = practice.id || uuidv4()
              knownPracticeIds.add(id)
              insertPractice.run(
                id,
                title,
                normalizeColor(practice.color),
                practice.active ? 1 : 0,
                req.user.id,
                practice.created_at || now,
                practice.updated_at || now,
                practice.active ? null : (practice.archived_at || now)
              )
              report.imported++
            }
            const checks = Array.isArray(jsonSpecial.checks) ? jsonSpecial.checks : []
            for (const check of checks) {
              const entryDate = normalizeDueDate(check.entry_date)
              if (!check.practice_id || !entryDate || !knownPracticeIds.has(check.practice_id)) continue
              insertAgendaCheck.run(
                check.practice_id,
                entryDate,
                check.done ? 1 : 0,
                req.user.id,
                check.updated_at || now
              )
              report.imported++
            }
            if (jsonSpecial.life_profile) {
              upsertLifeProfile.run(
                req.user.id,
                normalizeDueDate(jsonSpecial.life_profile.birth_date),
                clampInt(jsonSpecial.life_profile.life_expectancy_years, 1, 130, 85),
                jsonSpecial.life_profile.updated_at || now
              )
              report.imported++
            }
            continue
          }

          if (parsedSpecial.data.philoweek_type === 'quotes') {
            const quotes = parseQuotesExport(parsedSpecial.content)
            for (const quote of quotes) {
              const id = uuidv4()
              const now = new Date().toISOString()
              insertQuote.run(
                id,
                quote.quote,
                quote.author,
                quote.source,
                quote.notes,
                quote.tags,
                req.user.id,
                quote.created_at || now,
                now
              )
              report.imported++
            }
            continue
          }

          if (parsedSpecial.data.philoweek_type === 'fact_checks') {
            const factChecks = parseFactChecksExport(parsedSpecial.content)
            for (const factCheck of factChecks) {
              const id = uuidv4()
              const now = new Date().toISOString()
              insertFactCheck.run(
                id,
                factCheck.claim,
                factCheck.status,
                factCheck.notes,
                factCheck.source,
                factCheck.tags,
                req.user.id,
                factCheck.created_at || now,
                now
              )
              report.imported++
            }
            continue
          }

          const parts = relativePath.split('/')
          const fileName = parts[parts.length - 1]
          const dirParts = parts.slice(0, -1)

          let parentId = null
          let pathAccum = ''
          for (const dirName of dirParts) {
            pathAccum = pathAccum ? pathAccum + '/' + dirName : dirName
            if (!pathToId[pathAccum]) {
              const existing = db.prepare(
                "SELECT id FROM files WHERE name = ? AND parent_id IS ? AND type = 'folder' AND user_id = ? AND deleted_at IS NULL"
              ).get(dirName, parentId, req.user.id)
              if (existing) {
                pathToId[pathAccum] = existing.id
              } else {
                const id = uuidv4()
                insertFolder.run(id, parentId, dirName, req.user.id)
                pathToId[pathAccum] = id
              }
            }
            parentId = pathToId[pathAccum]
          }

          const existing = db.prepare(
            'SELECT id FROM files WHERE name = ? AND parent_id IS ? AND user_id = ? AND deleted_at IS NULL'
          ).get(fileName, parentId, req.user.id)

          let fileId
          if (existing) {
            if (conflict === 'skip') { report.skipped++; return }
            if (conflict === 'overwrite') {
              db.prepare('DELETE FROM file_revisions WHERE file_id = ?').run(existing.id)
              updateFile.run(rawContent, req.user.id, existing.id)
              fileId = existing.id
            } else {
              const newName = addImportSuffix(fileName)
              fileId = uuidv4()
              insertFile.run(fileId, parentId, newName, rawContent, req.user.id, req.user.id)
            }
          } else {
            fileId = uuidv4()
            insertFile.run(fileId, parentId, fileName, rawContent, req.user.id, req.user.id)
          }

          pathToId[relativePath] = fileId
          updateTags(db, fileId, rawContent)
          report.imported++
        } catch (err) {
          report.errors.push(`${relativePath}: ${err.message}`)
        }
      }

      if (fileHistoryPayload && Array.isArray(fileHistoryPayload.files)) {
        for (const historyFile of fileHistoryPayload.files) {
          const fileId = pathToId[String(historyFile.path || '')]
          if (!fileId) continue
          const revisions = Array.isArray(historyFile.revisions) ? historyFile.revisions : []
          if (!revisions.length) continue
          db.prepare('DELETE FROM file_revisions WHERE file_id = ?').run(fileId)
          for (const revision of revisions) {
            if (!Number.isInteger(Number(revision.revision_no))) continue
            insertRevision.run(
              fileId,
              req.user.id,
              Number(revision.revision_no),
              String(revision.content || ''),
              normalizeIsoDate(revision.created_at) || new Date().toISOString(),
              findUserIdByUsername(db, revision.actor_username)
            )
          }
          const currentRevision = Number(historyFile.current_revision)
          const currentExists = db.prepare(
            'SELECT 1 FROM file_revisions WHERE file_id = ? AND revision_no = ?'
          ).get(fileId, currentRevision)
          const fallback = db.prepare('SELECT MAX(revision_no) AS value FROM file_revisions WHERE file_id = ?').get(fileId)?.value || 0
          db.prepare('UPDATE files SET history_revision = ?, content_version = ? WHERE id = ?')
            .run(currentExists ? currentRevision : fallback, Math.max(0, Number(historyFile.content_version) || 0), fileId)
        }
      }

      if (trashPayload && Array.isArray(trashPayload.files)) {
        const oldToNewId = new Map()
        const pending = trashPayload.files.slice()
        let safety = pending.length + 1
        while (pending.length && safety-- > 0) {
          let progressed = false
          for (let index = pending.length - 1; index >= 0; index--) {
            const file = pending[index]
            const parentInTrash = trashPayload.files.some(candidate => candidate.id === file.parent_id)
            if (parentInTrash && !oldToNewId.has(file.parent_id)) continue
            const parentPath = trashPayload.active_parents?.[file.parent_id]
            const parentId = oldToNewId.get(file.parent_id) || pathToId[parentPath] || null
            const id = uuidv4()
            insertTrashedFile.run(
              id,
              parentId,
              String(file.name || 'Sans titre'),
              ['file', 'folder', 'locked_folder'].includes(file.type) ? file.type : 'file',
              file.content ?? null,
              file.password_hash ?? null,
              file.encrypted_content ?? null,
              normalizeIsoDate(file.created_at) || new Date().toISOString(),
              normalizeIsoDate(file.updated_at) || new Date().toISOString(),
              Number(file.sort_order) || 0,
              req.user.id,
              normalizeIsoDate(file.deleted_at) || new Date().toISOString(),
              Number(file.history_revision) || 0,
              Math.max(0, Number(file.content_version) || 0),
              findUserIdByUsername(db, file.last_edited_by_username)
            )
            oldToNewId.set(file.id, id)
            pending.splice(index, 1)
            progressed = true
            report.imported++
          }
          if (!progressed) break
        }
        for (const revision of Array.isArray(trashPayload.revisions) ? trashPayload.revisions : []) {
          const fileId = oldToNewId.get(revision.file_id)
          if (!fileId || !Number.isInteger(Number(revision.revision_no))) continue
          insertRevision.run(
            fileId,
            req.user.id,
            Number(revision.revision_no),
            String(revision.content || ''),
            normalizeIsoDate(revision.created_at) || new Date().toISOString(),
            findUserIdByUsername(db, revision.actor_username)
          )
        }
      }

      if (sharePayload && Array.isArray(sharePayload.shares)) {
        const insertShare = db.prepare(`
          INSERT INTO file_shares (
            id, file_id, owner_id, shared_with_user_id, permission, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(file_id, shared_with_user_id)
          DO UPDATE SET permission = excluded.permission, updated_at = excluded.updated_at
        `)
        for (const share of sharePayload.shares) {
          const fileId = pathToId[String(share.path || '')]
          const recipientId = findUserIdByUsername(db, share.username)
          if (!fileId || !recipientId || recipientId === req.user.id) continue
          insertShare.run(
            uuidv4(),
            fileId,
            req.user.id,
            recipientId,
            share.permission === 'edit' ? 'edit' : 'view',
            normalizeIsoDate(share.created_at) || new Date().toISOString(),
            normalizeIsoDate(share.updated_at) || new Date().toISOString()
          )
          report.imported++
        }
      }

      if (spreadsheetMetadataPayload && Array.isArray(spreadsheetMetadataPayload.workbooks)) {
        for (const item of spreadsheetMetadataPayload.workbooks) {
          const fileId = pathToId[String(item.path || '')]
          const content = String(item.content || '')
          const parsed = safeJson(content)
          if (!fileId || parsed?.philoweek_type !== 'spreadsheet') continue
          db.prepare(`
            UPDATE files SET content = ?, updated_at = datetime('now'), content_version = content_version + 1
            WHERE id = ? AND user_id = ? AND name LIKE '%.xlsx'
          `).run(content, fileId, req.user.id)
        }
      }

      if (roadTripsPayload && Array.isArray(roadTripsPayload.trips)) {
        const insertTrip = db.prepare(`
          INSERT INTO road_trips (
            id, user_id, title, description, status, tag, color, points_json,
            distance_km, distance_manual, elevation_m, start_date, end_date,
            cover_photo_id, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertPhoto = db.prepare(`
          INSERT INTO road_trip_photos (
            id, trip_id, user_id, filename, caption, point_id, lat, lng, width, height, bytes, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertNote = db.prepare(`
          INSERT INTO road_trip_notes (
            id, trip_id, user_id, lat, lng, title, body, color, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const allPhotos = Array.isArray(roadTripsPayload.photos) ? roadTripsPayload.photos : []
        const allNotes = Array.isArray(roadTripsPayload.notes) ? roadTripsPayload.notes : []
        const now = new Date().toISOString()
        roadTripsPayload.trips.forEach((trip, index) => {
          const newTripId = uuidv4()
          // Insère d'abord le voyage (le trip_id des photos y fait référence via FK),
          // couverture nulle pour l'instant — on la remappe après les photos.
          insertTrip.run(
            newTripId, req.user.id,
            String(trip.title || 'Voyage sans titre').slice(0, 200),
            trip.description ? String(trip.description).slice(0, 20000) : null,
            trip.status === 'planned' ? 'planned' : 'done',
            trip.tag ? String(trip.tag).slice(0, 60) : null,
            /^#[0-9a-f]{6}$/i.test(String(trip.color || '')) ? String(trip.color).toLowerCase() : '#e8663f',
            typeof trip.points_json === 'string' ? trip.points_json : JSON.stringify(trip.points || []),
            Number.isFinite(Number(trip.distance_km)) ? Number(trip.distance_km) : null,
            trip.distance_manual ? 1 : 0,
            Number.isFinite(Number(trip.elevation_m)) ? Number(trip.elevation_m) : null,
            normalizeDueDate(trip.start_date),
            normalizeDueDate(trip.end_date),
            null,
            Number.isFinite(Number(trip.sort_order)) ? Number(trip.sort_order) : index,
            normalizeIsoDate(trip.created_at) || now,
            normalizeIsoDate(trip.updated_at) || now
          )
          report.imported++

          const oldToNewPhotoId = new Map()
          const tripPhotos = allPhotos.filter(p => p.trip_id === trip.id)
          tripPhotos.forEach((photo, photoIndex) => {
            const buffer = roadtripPhotoBuffers.get(photo.filename)
            if (!buffer) return // binaire absent du zip : on saute cette photo
            const ext = (path.extname(photo.filename || '').toLowerCase()) || '.jpg'
            const newFilename = `${uuidv4()}${ROADTRIP_PHOTO_EXT[ext] ? ext : '.jpg'}`
            const newPhotoId = uuidv4()
            oldToNewPhotoId.set(photo.id, newPhotoId)
            insertPhoto.run(
              newPhotoId, newTripId, req.user.id, newFilename,
              photo.caption || null, photo.point_id || null,
              Number.isFinite(Number(photo.lat)) ? Number(photo.lat) : null,
              Number.isFinite(Number(photo.lng)) ? Number(photo.lng) : null,
              Number.isFinite(Number(photo.width)) ? Number(photo.width) : null,
              Number.isFinite(Number(photo.height)) ? Number(photo.height) : null,
              Number.isFinite(Number(photo.bytes)) ? Number(photo.bytes) : buffer.length,
              Number.isFinite(Number(photo.sort_order)) ? Number(photo.sort_order) : photoIndex,
              normalizeIsoDate(photo.created_at) || now
            )
            roadtripPhotoWrites.push({ filename: newFilename, buffer })
            report.imported++
          })

          const newCover = oldToNewPhotoId.get(trip.cover_photo_id)
          if (newCover) {
            db.prepare('UPDATE road_trips SET cover_photo_id = ? WHERE id = ? AND user_id = ?').run(newCover, newTripId, req.user.id)
          }

          const tripNotes = allNotes.filter(n => n.trip_id === trip.id)
          tripNotes.forEach((note, noteIndex) => {
            const lat = Number(note.lat)
            const lng = Number(note.lng)
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
            insertNote.run(
              uuidv4(), newTripId, req.user.id, lat, lng,
              note.title ? String(note.title).slice(0, 200) : null,
              note.body ? String(note.body).slice(0, 5000) : null,
              /^#[0-9a-f]{6}$/i.test(String(note.color || '')) ? String(note.color).toLowerCase() : null,
              Number.isFinite(Number(note.sort_order)) ? Number(note.sort_order) : noteIndex,
              normalizeIsoDate(note.created_at) || now,
              normalizeIsoDate(note.updated_at) || now
            )
            report.imported++
          })
        })
      }

      // Les imports Obsidian sans historique commencent avec leur contenu actuel.
      db.prepare(`
        INSERT OR IGNORE INTO file_revisions (file_id, user_id, revision_no, content, created_at)
        SELECT id, user_id, history_revision, COALESCE(content, ''), COALESCE(updated_at, datetime('now'))
        FROM files
        WHERE user_id = ? AND type = 'file' AND content IS NOT NULL
      `).run(req.user.id)
    })

    importTx()

    // Écrit les binaires des photos road trips sur le volume persistant (après commit DB).
    if (roadtripPhotoWrites.length > 0) {
      try { if (!fs.existsSync(ROADTRIP_PHOTOS_DIR)) fs.mkdirSync(ROADTRIP_PHOTOS_DIR, { recursive: true }) } catch (_) {}
      for (const { filename, buffer } of roadtripPhotoWrites) {
        try { fs.writeFileSync(path.join(ROADTRIP_PHOTOS_DIR, filename), buffer) }
        catch (err) { report.errors.push(`roadtrip-photos/${filename}: ${err.message}`) }
      }
    }

    // Phase 4: resolve [[links]] — one query to get all files with content
    const allFiles = db.prepare("SELECT id, name, content FROM files WHERE type = 'file' AND user_id = ? AND deleted_at IS NULL").all(req.user.id)
    const nameToId = {}
    allFiles.forEach(f => {
      nameToId[f.name] = f.id
      nameToId[f.name.replace(/\.md$/i, '')] = f.id
    })

    const linkTx = db.transaction(() => {
      const deleteLinks = db.prepare('DELETE FROM file_links WHERE source_id = ?')
      const insertLink = db.prepare(
        'INSERT OR IGNORE INTO file_links (source_id, target_id, link_text) VALUES (?, ?, ?)'
      )
      const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
      for (const file of allFiles) {
        const content = file.content || ''
        deleteLinks.run(file.id)
        let m
        linkRegex.lastIndex = 0
        while ((m = linkRegex.exec(content)) !== null) {
          const linkText = m[1].trim()
          const targetId = nameToId[linkText] || nameToId[linkText + '.md']
          if (targetId && targetId !== file.id) {
            try { insertLink.run(file.id, targetId, linkText); report.linksResolved++ }
            catch (_) {}
          } else {
            report.linksBroken++
          }
        }
      }
    })

    linkTx()

    res.json({ ok: true, report })
  } catch (err) {
    console.error('Import error:', err)
    res.status(500).json({ error: "Import impossible. Le fichier n'a pas pu être traité." })
  }
})

module.exports = router

function safeMatter(rawContent) {
  try { return matter(rawContent) }
  catch (_) { return { data: {}, content: rawContent } }
}

function safeJson(rawContent) {
  try { return JSON.parse(String(rawContent || '').replace(/^\uFEFF/, '')) }
  catch (_) { return null }
}

function addImportSuffix(fileName) {
  const match = String(fileName || '').match(/^(.*?)(\.[^.]+)$/)
  const suffix = `-import-${Date.now()}`
  return match ? `${match[1]}${suffix}${match[2]}` : `${fileName}${suffix}`
}

function parseQuotesExport(content) {
  return String(content || '')
    .split(/\n---\n/g)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n')
      const quoteLines = []
      let i = 0
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const rest = lines.slice(i).join('\n').trim()
      const author = matchLine(rest, 'Auteur')
      const source = matchLine(rest, 'Source')
      const tags = matchLine(rest, 'Tags') || '[]'
      const created = matchLine(rest, 'Ajoute')
      const notesMatch = rest.match(/Notes:\n([\s\S]*)$/)
      return {
        quote: quoteLines.join('\n').trim(),
        author,
        source,
        tags,
        created_at: created,
        notes: notesMatch ? notesMatch[1].trim() : null,
      }
    })
    .filter(q => q.quote)
}

const STATUS_LABEL_TO_VALUE = {
  'a verifier': 'to_check',
  'vrai': 'true',
  'faux': 'false',
  'partiellement vrai': 'partial',
}

function parseFactChecksExport(content) {
  return String(content || '')
    .split(/\n---\n/g)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n')
      const claimLines = []
      let i = 0
      while (i < lines.length && lines[i].startsWith('>')) {
        claimLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const rest = lines.slice(i).join('\n').trim()
      const statusLabel = matchLine(rest, 'Statut')
      const source = matchLine(rest, 'Source')
      const tags = matchLine(rest, 'Tags') || '[]'
      const created = matchLine(rest, 'Ajoute')
      const notesMatch = rest.match(/Notes:\n([\s\S]*)$/)
      return {
        claim: claimLines.join('\n').trim(),
        status: STATUS_LABEL_TO_VALUE[String(statusLabel || '').trim().toLowerCase()] || 'to_check',
        source,
        tags,
        created_at: created,
        notes: notesMatch ? notesMatch[1].trim() : null,
      }
    })
    .filter(f => f.claim)
}

function matchLine(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(text || '').match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'))
  return match ? match[1].trim() : null
}

function normalizeDueDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function normalizeIsoDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const date = new Date(text)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function normalizeColor(value) {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#6ba3e8'
}

function normalizeImage(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(text)) return text
  // Autorise aussi une URL http(s) directe (image distante).
  if (/^https?:\/\/\S+$/i.test(text) && text.length <= 2048) return text
  return null
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(String))
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return JSON.stringify(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch (_) {
    return '[]'
  }
}

function nullableInt(value, min, max) {
  if (value === null || value === undefined || value === '') return null
  const next = Number(value)
  if (!Number.isFinite(next)) return null
  const rounded = Math.round(next)
  if (rounded < min || rounded > max) return null
  return rounded
}

function clampInt(value, min, max, fallback) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.min(max, Math.max(min, Math.round(next)))
}

function findUserIdByUsername(db, username) {
  const value = String(username || '').trim()
  if (!value) return null
  return db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(value)?.id || null
}
