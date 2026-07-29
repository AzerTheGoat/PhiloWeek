const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const Database = require('better-sqlite3')
const JSZip = require('jszip')

test('un dossier reste chiffré en base lorsqu’il est ouvert', { timeout: 60_000 }, async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opuscule-vault-test-'))
  const databasePath = path.join(dataDir, 'test.db')
  const port = 32000 + Math.floor(Math.random() * 1000)
  const server = spawn(process.execPath, ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      DATABASE_PATH: databasePath,
      PORT: String(port),
      NODE_ENV: 'test',
      PUBLIC_READER_SECRET: 'test-reader-secret-that-is-long-enough-1234',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill()
      await once(server, 'exit')
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try { fs.rmSync(dataDir, { recursive: true, force: true }); break }
      catch (error) {
        if (attempt === 4) throw error
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
  })

  let startupError = ''
  server.stderr.on('data', chunk => { startupError += chunk.toString() })
  await waitForServer(`http://127.0.0.1:${port}/api/auth/me`, server, () => startupError)

  let cookie = ''
  async function request(method, url, body) {
    const response = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    return response
  }

  let response = await request('POST', '/api/auth/register', {
    username: `vault_${Date.now()}`,
    password: 'Connexion-test-12345',
  })
  assert.equal(response.status, 201, await response.clone().text())

  response = await request('POST', '/api/files', { name: 'Privé', type: 'folder' })
  assert.equal(response.status, 201, await response.clone().text())
  const folder = await response.json()

  const secret = 'CONTENU-TRES-SECRET-UNIQUE'
  response = await request('POST', '/api/files', {
    parent_id: folder.id,
    name: 'secret.md',
    type: 'file',
    content: secret,
  })
  assert.equal(response.status, 201, await response.clone().text())
  const note = await response.json()

  response = await request('POST', `/api/files/${folder.id}/encryption/enable`, {
    password: 'Coffre-test-tres-solide-123',
  })
  assert.equal(response.status, 200, await response.clone().text())

  response = await request('POST', '/api/files', { name: 'Parent', type: 'folder' })
  const parentFolder = await response.json()
  response = await request('POST', '/api/files', { parent_id: parentFolder.id, name: 'Interne', type: 'folder' })
  const innerFolder = await response.json()
  response = await request('POST', '/api/files', {
    parent_id: innerFolder.id,
    name: 'interne.md',
    type: 'file',
    content: 'contenu secondaire',
  })
  assert.equal(response.status, 201)
  response = await request('POST', `/api/files/${innerFolder.id}/encryption/enable`, {
    password: 'Coffre-test-tres-solide-123',
  })
  assert.equal(response.status, 200, await response.clone().text())
  response = await request('POST', `/api/files/${parentFolder.id}/encryption/enable`, {
    password: 'Coffre-test-tres-solide-123',
  })
  assert.equal(response.status, 409, 'un coffre parent ne doit jamais écraser un coffre descendant')

  const db = new Database(databasePath, { readonly: true })
  let stored = db.prepare('SELECT content, encrypted_content, encrypted_folder_id FROM files WHERE id = ?').get(note.id)
  assert.equal(stored.content, null)
  assert.equal(stored.encrypted_folder_id, folder.id)
  assert.ok(stored.encrypted_content)
  assert.equal(stored.encrypted_content.includes(secret), false)
  const revision = db.prepare('SELECT content, encrypted_content FROM file_revisions WHERE file_id = ?').get(note.id)
  assert.equal(revision.content, '')
  assert.ok(revision.encrypted_content)

  response = await request('GET', `/api/files/${note.id}`)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).content, secret)

  response = await request('POST', `/api/files/${folder.id}/encryption/lock`)
  assert.equal(response.status, 200)
  response = await request('GET', `/api/files/${note.id}`)
  assert.equal(response.status, 423)

  response = await request('POST', `/api/files/${folder.id}/encryption/open`, { password: 'mot-de-passe-incorrect' })
  assert.equal(response.status, 401)
  response = await request('POST', `/api/files/${folder.id}/encryption/open`, { password: 'Coffre-test-tres-solide-123' })
  assert.equal(response.status, 200, await response.clone().text())
  response = await request('GET', `/api/files/${note.id}`)
  assert.equal((await response.json()).content, secret)

  response = await request('POST', `/api/files/${folder.id}/encryption/lock`)
  assert.equal(response.status, 200)
  response = await request('POST', '/api/export/obsidian', { password: 'Coffre-test-tres-solide-123' })
  assert.equal(response.status, 200, await response.clone().text())
  assert.match(response.headers.get('content-type') || '', /application\/zip/)
  const exportedBuffer = Buffer.from(await response.arrayBuffer())
  const exportedZip = await JSZip.loadAsync(exportedBuffer)
  assert.ok(exportedZip.file('_Opuscule/EncryptedFolders.json'))
  assert.ok(exportedZip.file('Privé/secret.md'))
  assert.match(await exportedZip.file('Privé/secret.md').async('text'), new RegExp(secret))
  response = await request('GET', `/api/files/${note.id}`)
  assert.equal(response.status, 423, 'un export ne doit pas ouvrir le dossier dans la session')

  response = await request('DELETE', `/api/files/${folder.id}/encryption`, { password: 'Coffre-test-tres-solide-123' })
  assert.equal(response.status, 200, await response.clone().text())
  stored = db.prepare('SELECT content, encrypted_content, encrypted_folder_id FROM files WHERE id = ?').get(note.id)
  assert.equal(stored.content, secret)
  assert.equal(stored.encrypted_content, null)
  assert.equal(stored.encrypted_folder_id, null)

  response = await request('POST', '/api/auth/register', {
    username: `restore_${Date.now()}`,
    password: 'Connexion-restore-12345',
  })
  assert.equal(response.status, 201, await response.clone().text())
  const restoreUser = await response.json()
  const form = new FormData()
  form.append('vault', new Blob([exportedBuffer], { type: 'application/zip' }), 'backup.zip')
  form.append('vault_password', 'Coffre-restaure-solide-456')
  response = await fetch(`http://127.0.0.1:${port}/api/import/obsidian`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  assert.equal(response.status, 200, await response.clone().text())
  const restoredFolder = db.prepare(
    "SELECT * FROM files WHERE user_id = ? AND name = 'Privé' AND type = 'folder'"
  ).get(restoreUser.id)
  assert.equal(restoredFolder.is_encrypted, 1)
  const restoredNote = db.prepare(
    "SELECT * FROM files WHERE user_id = ? AND name = 'secret.md'"
  ).get(restoreUser.id)
  assert.equal(restoredNote.content, null)
  assert.ok(restoredNote.encrypted_content)
  assert.equal(restoredNote.encrypted_content.includes(secret), false)

  const opusculeFolder = db.prepare(
    "SELECT * FROM files WHERE user_id = ? AND parent_id IS NULL AND name = '_Opuscule' AND type = 'folder'"
  ).get(restoreUser.id)
  assert.ok(opusculeFolder, 'le dossier _Opuscule importé doit apparaître dans l’arbre')
  const encryptedManifest = db.prepare(
    "SELECT * FROM files WHERE user_id = ? AND parent_id = ? AND name = 'EncryptedFolders.json'"
  ).get(restoreUser.id, opusculeFolder.id)
  assert.ok(encryptedManifest)
  assert.match(encryptedManifest.content, /Privé/)

  response = await request('GET', '/api/files')
  assert.equal(response.status, 200)
  assert.ok((await response.json()).some(node => node.id === opusculeFolder.id))

  response = await request('POST', '/api/social-journal/articles', {
    title: 'Article avec image distante',
    content: '![Illustration](https://images.example.com/article.webp)',
    status: 'published',
    cover_image_data: 'https://images.example.com/cover.jpg',
  })
  assert.equal(response.status, 201, await response.clone().text())
  assert.match(response.headers.get('content-security-policy') || '', /img-src[^;]*https:/)
  const articleWithRemoteImage = await response.json()
  assert.equal(articleWithRemoteImage.cover_image_data, 'https://images.example.com/cover.jpg')

  response = await request('POST', '/api/social-journal/articles', {
    title: 'Article avec image HTTP refusée',
    content: 'Contenu',
    status: 'draft',
    cover_image_data: 'http://images.example.com/insecure.jpg',
  })
  assert.equal(response.status, 201, await response.clone().text())
  assert.equal((await response.json()).cover_image_data, null)

  response = await request('POST', '/api/historical-timeline', {
    title: 'Repere avec image distante',
    start: '1789-07-14',
    image_data: 'https://images.example.com/bastille.webp',
  })
  assert.equal(response.status, 201, await response.clone().text())
  const eventWithRemoteImage = await response.json()
  assert.equal(eventWithRemoteImage.image_data, 'https://images.example.com/bastille.webp')

  response = await request('POST', '/api/historical-timeline', {
    title: 'Repere avec image HTTP refusee',
    start: '1792-09-21',
    image_data: 'http://images.example.com/insecure.jpg',
  })
  assert.equal(response.status, 201, await response.clone().text())
  assert.equal((await response.json()).image_data, null)
  db.close()
})

async function waitForServer(url, child, getError) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`Le serveur de test s'est arrêté : ${getError()}`)
    try {
      const response = await fetch(url)
      if (response.status === 401) return
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Le serveur de test ne répond pas : ${getError()}`)
}
