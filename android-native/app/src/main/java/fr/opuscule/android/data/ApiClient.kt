package fr.opuscule.android.data

import fr.opuscule.android.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.TimeUnit

class ApiClient {
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(35, TimeUnit.SECONDS)
        .build()

    val publicBaseUrl: String get() = BuildConfig.API_BASE_URL.removeSuffix("/api")

    suspend fun authenticate(username: String, password: String, register: Boolean): Pair<User, String> {
        val body = JSONObject().put("username", username).put("password", password)
        val json = call(if (register) "/auth/mobile/register" else "/auth/mobile/login", "POST", body)
        return User(json.getString("id"), json.getString("username")) to json.getString("token")
    }

    suspend fun me(token: String): User {
        val json = call("/auth/me", token = token)
        return User(json.getString("id"), json.getString("username"))
    }

    suspend fun logout(token: String) {
        call("/auth/logout", "POST", JSONObject(), token)
    }

    suspend fun articles(token: String): List<Article> =
        callArray("/social-journal/articles?scope=feed", token = token).objects().map(::article)
            .sortedWith(
                compareBy<Article> { it.readByMe }
                    .thenByDescending { it.publishedOn.orEmpty() }
            )

    suspend fun article(token: String, id: String): Article {
        val json = call("/social-journal/articles/$id", token = token)
        return article(json).copy(comments = json.optJSONArray("comments").orEmpty().objects().map(::comment))
    }

    suspend fun markArticleRead(token: String, id: String) {
        call("/social-journal/articles/$id/read", "POST", JSONObject(), token)
    }

    suspend fun toggleArticleLike(token: String, id: String) {
        call("/social-journal/articles/$id/reaction", "POST", JSONObject(), token)
    }

    suspend fun deleteArticle(token: String, id: String) {
        call("/social-journal/articles/$id", "DELETE", token = token)
    }

    suspend fun addComment(token: String, articleId: String, body: String, parentId: String? = null) {
        val payload = JSONObject().put("body", body)
        if (parentId != null) payload.put("parent_id", parentId)
        call("/social-journal/articles/$articleId/comments", "POST", payload, token)
    }

    suspend fun deleteComment(token: String, id: String) {
        call("/social-journal/comments/$id", "DELETE", token = token)
    }

    suspend fun files(token: String): List<FileNode> =
        parseFileNodes(callArray("/files", token = token), 0)

    suspend fun resolveWikiLink(token: String, target: String): String? {
        val normalized = target.substringBefore('|').trim().replace('\\', '/').trim('/')
        if (normalized.isBlank()) return null
        val candidates = mutableListOf<Pair<String, FileNode>>()
        fun walk(nodes: List<FileNode>, parentPath: String) {
            nodes.forEach { node ->
                val path = if (parentPath.isBlank()) node.name else "$parentPath/${node.name}"
                if (!node.isFolder) candidates += path to node
                walk(node.children, path)
            }
        }
        walk(files(token), "")
        val wanted = normalizeWikiTarget(normalized)
        return candidates.firstOrNull { normalizeWikiTarget(it.first) == wanted }?.second?.id
            ?: candidates.firstOrNull { normalizeWikiTarget(it.second.name) == wanted }?.second?.id
            ?: candidates.firstOrNull {
                normalizeWikiTarget(it.first).endsWith("/$wanted")
            }?.second?.id
    }

    suspend fun file(token: String, id: String): FileDetail {
        val row = call("/files/$id", token = token)
        if (row.optBoolean("is_locked") || row.optBoolean("locked")) {
            throw ApiException(423, "Ce dossier est verrouillé.")
        }
        return FileDetail(
            id = row.getString("id"),
            parentId = row.nullable("parent_id"),
            name = row.optString("name"),
            type = row.optString("type", "file"),
            content = row.optString("content"),
            contentVersion = row.optInt("content_version"),
            canEdit = row.optJSONObject("access")?.optBoolean("can_edit")
                ?: row.optBoolean("can_edit", false),
            encrypted = row.optBoolean("is_encrypted") || row.nullable("encrypted_folder_id") != null,
        )
    }

    suspend fun updateFile(token: String, file: FileDetail, content: String): FileDetail {
        val row = call(
            "/files/${file.id}",
            "PUT",
            JSONObject().put("content", content).put("base_version", file.contentVersion),
            token,
        )
        return file.copy(
            content = row.optString("content", content),
            contentVersion = row.optInt("content_version", file.contentVersion + 1),
        )
    }

    suspend fun createNote(token: String, title: String, content: String, parentId: String? = null): FileDetail {
        val name = if (title.endsWith(".md", true)) title else "$title.md"
        val payload = JSONObject().put("name", name).put("type", "file").put("content", content)
        if (parentId != null) payload.put("parent_id", parentId)
        val row = call("/files", "POST", payload, token)
        return FileDetail(
            row.getString("id"),
            row.nullable("parent_id"),
            row.optString("name"),
            row.optString("type", "file"),
            row.optString("content"),
            row.optInt("content_version"),
            true,
            row.optBoolean("is_encrypted"),
        )
    }

    suspend fun addQuickDefinition(
        token: String,
        term: String,
        definition: String,
        example: String,
    ) {
        val folderName = "Définitions capturées"
        val fileName = "Mes définitions.json"
        var roots = files(token)
        var folder = roots.firstOrNull { it.isFolder && it.name.equals(folderName, ignoreCase = true) }
        if (folder == null) {
            call(
                "/files",
                "POST",
                JSONObject().put("name", folderName).put("type", "folder"),
                token,
            )
            roots = files(token)
            folder = roots.firstOrNull { it.isFolder && it.name.equals(folderName, ignoreCase = true) }
                ?: throw ApiException(500, "Le dossier de définitions n’a pas pu être créé.")
        }

        val existing = folder.children.firstOrNull {
            !it.isFolder && it.name.equals(fileName, ignoreCase = true)
        }
        val now = Instant.now().toString()
        if (existing == null) {
            val content = JSONObject()
                .put("philoweek_type", "definitions")
                .put("version", 1)
                .put("id", "definitions-capturees")
                .put("title", "Mes définitions")
                .put("description", "Définitions capturées depuis l’application mobile.")
                .put("tags", JSONArray())
                .put("created", now)
                .put("modified", now)
                .put(
                    "definitions",
                    JSONArray().put(
                        JSONObject()
                            .put("id", "d-${System.currentTimeMillis()}")
                            .put("term", term.trim())
                            .put("definition", definition.trim())
                            .put("example", example.trim())
                            .put("tags", JSONArray())
                    )
                )
            call(
                "/files",
                "POST",
                JSONObject()
                    .put("parent_id", folder.id)
                    .put("name", fileName)
                    .put("type", "file")
                    .put("content", content.toString(2)),
                token,
            )
            return
        }

        val detail = file(token, existing.id)
        val json = runCatching { JSONObject(detail.content) }.getOrElse {
            throw ApiException(400, "Le fichier de définitions rapides est invalide.")
        }
        val definitions = json.optJSONArray("definitions") ?: JSONArray().also {
            json.put("definitions", it)
        }
        val normalizedTerm = term.trim()
        val matching = definitions.objects().firstOrNull {
            it.optString("term").equals(normalizedTerm, ignoreCase = true)
        }
        if (matching != null) {
            matching.put("definition", definition.trim()).put("example", example.trim())
        } else {
            definitions.put(
                JSONObject()
                    .put("id", "d-${System.currentTimeMillis()}")
                    .put("term", normalizedTerm)
                    .put("definition", definition.trim())
                    .put("example", example.trim())
                    .put("tags", JSONArray())
            )
        }
        json.put("modified", now)
        updateFile(token, detail, json.toString(2))
    }

    suspend fun openEncryptedFolder(token: String, id: String, password: String) {
        call("/files/$id/encryption/open", "POST", JSONObject().put("password", password), token)
    }

    suspend fun review(token: String, fileIds: List<String>? = null, limit: Int = 12): List<ReviewQuestion> {
        val payload = JSONObject().put("limit", limit)
        if (fileIds == null) {
            payload.put("scope", "all")
        } else {
            payload.put("scope", "source_files").put("file_ids", JSONArray(fileIds))
        }
        val json = call("/questionnaires/session", "POST", payload, token)
        return json.optJSONArray("questions").orEmpty().objects().map(::reviewQuestion)
    }

    suspend fun reviewResults(token: String): List<ReviewResult> =
        callArray("/questionnaires/results", token = token).objects().map {
            ReviewResult(it.optString("question_key"), it.optBoolean("correct"), it.nullable("created_at"))
        }

    suspend fun saveReview(token: String, question: ReviewQuestion, known: Boolean) {
        call("/questionnaires/results", "POST", JSONObject()
            .put("question_key", question.key)
            .put("questionnaire_file_id", question.fileId)
            .put("questionnaire_title", question.questionnaireTitle)
            .put("question_id", question.id)
            .put("question_text", question.prompt)
            .put("answer_text", "")
            .put("expected_answer", question.answer)
            .put("correct", known)
            .put("score", if (known) 1 else 0), token)
        if (question.kind == "actor" && question.actorKey != null) saveActorProgress(token, question, known)
    }

    suspend fun editReviewQuestion(
        token: String,
        question: ReviewQuestion,
        prompt: String,
        answer: String,
        explanation: String,
    ) {
        val detail = file(token, question.fileId)
        val json = JSONObject(detail.content)
        when (question.kind) {
            "definition" -> {
                val rows = json.optJSONArray("definitions") ?: throw ApiException(400, "Fichier de définitions invalide.")
                val row = rows.optJSONObject(question.index) ?: throw ApiException(404, "Définition introuvable.")
                row.put("term", prompt.removePrefix("Définis :").removePrefix("Definis :").trim())
                    .put("definition", answer)
                    .put("example", explanation)
            }
            "actor" -> {
                val rows = json.optJSONArray("nodes") ?: throw ApiException(400, "Réseau d’acteurs invalide.")
                val row = rows.objects().firstOrNull { it.optString("id") == question.actorKey }
                    ?: throw ApiException(404, "Personne introuvable.")
                row.put("name", answer).put("summary", explanation)
            }
            else -> {
                val rows = json.optJSONArray("questions") ?: throw ApiException(400, "Questionnaire JSON invalide.")
                val row = findQuestion(rows, question) ?: throw ApiException(404, "Question introuvable.")
                row.put("prompt", prompt).put("answer", answer).put("explanation", explanation)
            }
        }
        json.put("modified", Instant.now().toString())
        updateFile(token, detail, json.toString(2))
    }

    suspend fun deleteQuestion(token: String, question: ReviewQuestion) {
        if (question.kind != "questionnaire") throw ApiException(400, "Seules les questions de questionnaire peuvent être supprimées.")
        val detail = file(token, question.fileId)
        val json = JSONObject(detail.content)
        val rows = json.optJSONArray("questions") ?: throw ApiException(400, "Questionnaire JSON invalide.")
        val index = (0 until rows.length()).firstOrNull {
            rows.optJSONObject(it)?.optString("id") == question.id
        } ?: question.index
        if (index !in 0 until rows.length()) throw ApiException(404, "Question introuvable.")
        rows.remove(index)
        json.put("modified", Instant.now().toString())
        updateFile(token, detail, json.toString(2))
    }

    suspend fun setRequireChange(token: String, question: ReviewQuestion, required: Boolean) {
        val detail = file(token, question.fileId)
        val json = JSONObject(detail.content)
        val rows = when (question.kind) {
            "definition" -> json.optJSONArray("definitions")
            "actor" -> json.optJSONArray("nodes")
            else -> json.optJSONArray("questions")
        } ?: throw ApiException(400, "Fichier de révision invalide.")
        val expectedId = question.actorKey ?: question.id
        val row = rows.objects().firstOrNull { it.optString("id") == expectedId }
            ?: rows.optJSONObject(question.index)
            ?: throw ApiException(404, "Élément introuvable.")
        if (required) row.put("require_change", true) else row.remove("require_change")
        json.put("modified", Instant.now().toString())
        updateFile(token, detail, json.toString(2))
    }

    suspend fun dictionary(token: String, word: String, language: String): DictionaryEntry {
        val row = call("/dictionary/$language/${java.net.URLEncoder.encode(word, "UTF-8")}", token = token)
        return DictionaryEntry(
            word = row.optString("word", word),
            language = row.optString("language", language),
            phonetic = row.optString("phonetic"),
            definitions = row.optJSONArray("definitions").orEmpty().objects().map {
                DictionaryDefinition(it.optString("part_of_speech"), it.optString("definition"), it.optString("example"))
            },
            source = row.optString("source"),
            sourceUrl = row.optString("source_url"),
        )
    }

    suspend fun renderMermaid(token: String, source: String, dark: Boolean): ByteArray =
        callBytes(
            "/markdown/mermaid",
            JSONObject().put("source", source).put("dark", dark),
            token,
        )

    suspend fun ideas(token: String): List<Idea> =
        callArray("/inbox/ideas", token = token).objects().map {
            Idea(it.getString("id"), it.optString("content"), it.optString("tags"), it.nullable("created_at"))
        }

    suspend fun createIdea(token: String, content: String) {
        call("/inbox/ideas", "POST", JSONObject().put("content", content).put("tags", JSONArray()), token)
    }

    suspend fun deleteIdea(token: String, id: String) {
        call("/inbox/ideas/$id", "DELETE", token = token)
    }

    suspend fun quotes(token: String): List<Quote> =
        callArray("/life/quotes", token = token).objects().map {
            Quote(it.getString("id"), it.optString("quote"), it.nullable("author"), it.nullable("source"), it.nullable("notes"), it.nullable("created_at"))
        }

    suspend fun createQuote(token: String, quote: String, author: String, source: String, notes: String = "") {
        call("/life/quotes", "POST", JSONObject()
            .put("quote", quote).put("author", author).put("source", source).put("notes", notes)
            .put("tags", JSONArray()), token)
    }

    suspend fun deleteQuote(token: String, id: String) {
        call("/life/quotes/$id", "DELETE", token = token)
    }

    suspend fun factChecks(token: String): List<FactCheck> =
        callArray("/life/fact-checks", token = token).objects().map {
            FactCheck(it.getString("id"), it.optString("claim"), it.optString("status"), it.nullable("source"), it.nullable("notes"), it.nullable("created_at"))
        }

    suspend fun createFact(token: String, claim: String, source: String, notes: String) {
        call("/life/fact-checks", "POST", JSONObject()
            .put("claim", claim).put("source", source).put("notes", notes).put("tags", JSONArray()), token)
    }

    suspend fun updateFactStatus(token: String, id: String, status: String) {
        call("/life/fact-checks/$id", "PUT", JSONObject().put("status", status), token)
    }

    suspend fun deleteFact(token: String, id: String) {
        call("/life/fact-checks/$id", "DELETE", token = token)
    }

    suspend fun todos(token: String, status: String = "all"): List<Todo> =
        callArray("/todos?status=$status", token = token).objects().map {
            Todo(it.getString("id"), it.optString("title"), it.nullable("notes"), it.optString("status"), it.optString("due_at"))
        }

    suspend fun createTodo(token: String, title: String, dueAt: String, notes: String) {
        call("/todos", "POST", JSONObject().put("title", title).put("due_at", dueAt).put("notes", notes), token)
    }

    suspend fun toggleTodo(token: String, todo: Todo) {
        call("/todos/${todo.id}", "PUT", JSONObject().put("status", if (todo.status == "done") "open" else "done"), token)
    }

    suspend fun deleteTodo(token: String, id: String) {
        call("/todos/$id", "DELETE", token = token)
    }

    suspend fun agenda(token: String, days: Int = 42): Agenda {
        val json = call("/todos/dashboard?days=$days", token = token)
        val profile = json.optJSONObject("profile") ?: JSONObject()
        return Agenda(
            today = json.optString("today", LocalDate.now().toString()),
            since = json.optString("since"),
            practices = json.optJSONArray("practices").orEmpty().objects().map {
                Practice(it.getString("id"), it.optString("title"), it.optBoolean("active"))
            },
            checks = json.optJSONArray("checks").orEmpty().objects().map {
                PracticeCheck(it.getString("practice_id"), it.optString("entry_date"), it.optBoolean("done"))
            },
            profile = LifeProfile(profile.nullable("birth_date"), profile.optInt("life_expectancy_years", 85)),
        )
    }

    suspend fun checkPractice(token: String, id: String, date: String, done: Boolean) {
        call("/todos/practices/$id/check", "PUT", JSONObject().put("entry_date", date).put("done", done), token)
    }

    suspend fun createPractice(token: String, title: String) {
        call("/todos/practices", "POST", JSONObject().put("title", title), token)
    }

    suspend fun updateLifeProfile(token: String, birthDate: String, years: Int) {
        call("/todos/life-profile", "PUT", JSONObject()
            .put("birth_date", birthDate).put("life_expectancy_years", years), token)
    }

    suspend fun usage(token: String): UsageSummary {
        val json = call("/timer/app-usage", token = token)
        return UsageSummary(
            todaySeconds = json.optInt("today_seconds"),
            weekSeconds = json.optInt("week_seconds"),
            monthSeconds = json.optInt("month_seconds"),
            averageDailyMonthSeconds = json.optInt("average_daily_month_seconds"),
            averageWeeklySeconds = json.optInt("average_weekly_seconds"),
            totalSeconds = json.optInt("total_seconds"),
            history = json.optJSONArray("history").orEmpty().objects().map {
                UsageDay(it.optString("entry_date"), it.optInt("duration_seconds"))
            },
            months = json.optJSONArray("monthly_history").orEmpty().objects().map {
                UsageMonth(it.optString("entry_month"), it.optInt("duration_seconds"), it.optInt("active_days"))
            },
        )
    }

    suspend fun trackUsage(token: String, day: String, seconds: Int) {
        call("/timer/app-usage", "POST", JSONObject()
            .put("entries", JSONArray().put(JSONObject().put("day", day).put("seconds", seconds.coerceIn(1, 300)))), token)
    }

    private suspend fun saveActorProgress(token: String, question: ReviewQuestion, known: Boolean) {
        val detail = file(token, question.fileId)
        val json = JSONObject(detail.content)
        val learning = json.optJSONObject("learning") ?: JSONObject()
        val progress = learning.optJSONObject("progress") ?: JSONObject()
        val current = progress.optJSONObject(question.actorKey!!) ?: JSONObject()
        val previous = current.optInt("interval_days")
        val interval = if (!known) 1 else when {
            previous < 1 -> 1
            previous == 1 -> 3
            previous < 7 -> 7
            else -> (previous * 1.8).toInt().coerceAtMost(60)
        }
        val now = Instant.now()
        current.put("seen", current.optInt("seen") + 1)
            .put("known", current.optInt("known") + if (known) 1 else 0)
            .put("forgotten", current.optInt("forgotten") + if (known) 0 else 1)
            .put("interval_days", interval)
            .put("last_reviewed", now.toString())
            .put("next_review", now.plusSeconds(interval * 86_400L).toString())
        progress.put(question.actorKey, current)
        learning.put("progress", progress)
        json.put("learning", learning).put("modified", now.toString())
        updateFile(token, detail, json.toString(2))
    }

    private fun parseFileNodes(array: JSONArray, depth: Int): List<FileNode> = array.objects().map { row ->
        FileNode(
            id = row.getString("id"),
            parentId = row.nullable("parent_id"),
            name = row.optString("name"),
            type = row.optString("type"),
            depth = depth,
            locked = row.optBoolean("is_locked") || row.optBoolean("locked"),
            encrypted = row.optBoolean("is_encrypted"),
            canEdit = row.optBoolean("can_edit", true),
            children = parseFileNodes(row.optJSONArray("children").orEmpty(), depth + 1),
        )
    }

    private fun normalizeWikiTarget(value: String): String =
        value.replace('\\', '/').trim('/').substringBefore('#')
            .replace(Regex("\\.(md|json)$", RegexOption.IGNORE_CASE), "").lowercase()

    private fun reviewQuestion(row: JSONObject) = ReviewQuestion(
        key = row.getString("question_key"),
        id = row.optString("question_id"),
        fileId = row.getString("questionnaire_file_id"),
        questionnaireTitle = row.optString("questionnaire_title"),
        fileName = row.optString("file_name"),
        prompt = row.optString("prompt"),
        answer = row.optString("answer"),
        explanation = row.optString("explanation"),
        kind = row.optString("review_kind", "questionnaire"),
        type = row.optString("type", "open"),
        index = row.optInt("index"),
        image = row.nullable("image"),
        imageAlt = row.nullable("image_alt"),
        actorKey = row.nullable("actor_key"),
        sourceFileId = row.nullable("source_file_id"),
        sourceFileName = row.nullable("source_file_name"),
        sourceMissing = row.optBoolean("source_missing"),
        requireChange = row.optBoolean("require_change"),
    )

    private fun article(row: JSONObject) = Article(
        id = row.getString("id"),
        title = row.optString("title"),
        excerpt = row.nullable("excerpt"),
        content = row.nullable("content"),
        author = row.nullable("author_username"),
        publishedOn = row.nullable("published_on"),
        coverImage = row.nullable("cover_image_data"),
        commentCount = row.optInt("comment_count"),
        likeCount = row.optInt("like_count"),
        readCount = row.optInt("read_count"),
        readByMe = row.optBoolean("read_by_me"),
        likedByMe = row.optBoolean("liked_by_me"),
        canEdit = row.optBoolean("can_edit"),
    )

    private fun comment(row: JSONObject) = Comment(
        id = row.getString("id"),
        parentId = row.nullable("parent_id"),
        body = row.optString("body"),
        author = row.nullable("author_username"),
        canEdit = row.optBoolean("can_edit"),
        createdAt = row.nullable("created_at"),
    )

    private fun findQuestion(rows: JSONArray, question: ReviewQuestion): JSONObject? =
        rows.objects().firstOrNull { it.optString("id") == question.id } ?: rows.optJSONObject(question.index)

    private suspend fun callArray(path: String, method: String = "GET", body: JSONObject? = null, token: String? = null): JSONArray =
        callRaw(path, method, body, token).let { if (it.isBlank()) JSONArray() else JSONArray(it) }

    private suspend fun call(path: String, method: String = "GET", body: JSONObject? = null, token: String? = null): JSONObject =
        callRaw(path, method, body, token).let { if (it.isBlank()) JSONObject() else JSONObject(it) }

    private suspend fun callRaw(path: String, method: String, body: JSONObject?, token: String?): String = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(BuildConfig.API_BASE_URL.trimEnd('/') + path)
            .header("Accept", "application/json")
            .apply {
                if (token != null) header("Authorization", "Bearer $token")
                val requestBody = (body ?: JSONObject()).toString().toRequestBody(jsonType)
                when (method) {
                    "POST" -> post(requestBody)
                    "PUT" -> put(requestBody)
                    "PATCH" -> patch(requestBody)
                    "DELETE" -> delete()
                    else -> get()
                }
            }
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
                throw ApiException(response.code, message.ifBlank { "Erreur réseau (${response.code})." })
            }
            text
        }
    }

    private suspend fun callBytes(path: String, body: JSONObject, token: String): ByteArray = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(BuildConfig.API_BASE_URL.trimEnd('/') + path)
            .header("Accept", "image/png")
            .header("Authorization", "Bearer $token")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        http.newCall(request).execute().use { response ->
            val bytes = response.body?.bytes() ?: ByteArray(0)
            if (!response.isSuccessful) {
                val text = bytes.toString(Charsets.UTF_8)
                val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
                throw ApiException(response.code, message.ifBlank { "Erreur réseau (${response.code})." })
            }
            bytes
        }
    }
}

private fun JSONArray?.orEmpty(): JSONArray = this ?: JSONArray()
private fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull(::optJSONObject)
private fun JSONObject.nullable(key: String): String? =
    if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
