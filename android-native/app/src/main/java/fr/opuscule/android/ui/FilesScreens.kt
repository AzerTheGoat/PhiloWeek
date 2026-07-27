package fr.opuscule.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.rounded.AccountTree
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Calculate
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Quiz
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import fr.opuscule.android.AppState
import fr.opuscule.android.data.FileDetail
import fr.opuscule.android.data.FileNode
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun FilesScreen(state: AppState, openOverlay: (String) -> Unit) {
    val token = state.token ?: return
    var roots by remember { mutableStateOf<List<FileNode>>(emptyList()) }
    var expanded by remember { mutableStateOf<Set<String>>(emptySet()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var newNote by remember { mutableStateOf(false) }
    var unlock by remember { mutableStateOf<FileNode?>(null) }
    val scope = rememberCoroutineScope()

    fun load() = scope.launch {
        loading = true
        error = null
        runCatching { state.api.files(token) }
            .onSuccess {
                roots = it
                if (expanded.isEmpty()) expanded = it.filter(FileNode::isFolder).map(FileNode::id).toSet()
            }
            .onFailure { error = it.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            ScreenHeader("Fichiers", subtitle = "Toutes vos connaissances") {
                IconButton(onClick = { newNote = true }, modifier = Modifier.clip(CircleShape).background(Surface)) {
                    Icon(Icons.Rounded.Add, "Nouvelle note", tint = Ink)
                }
            }
            OutlinedTextField(
                query,
                { query = it },
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                placeholder = { Text("Rechercher un fichier") },
                leadingIcon = { Icon(Icons.Rounded.Search, null, tint = Muted) },
                singleLine = true,
                shape = RoundedCornerShape(15.dp),
            )
            Spacer(Modifier.height(10.dp))
            when {
                loading -> LoadingPane()
                error != null -> ErrorPane(error.orEmpty(), ::load)
                roots.isEmpty() -> EmptyPane("Aucun fichier", "Créez votre première note pour commencer.", Icons.Rounded.Description, "Nouvelle note") { newNote = true }
                else -> {
                    val rows = visibleFiles(roots, expanded, query)
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 8.dp)) {
                        items(rows, key = { it.id }) { file ->
                            FileRow(
                                file,
                                expanded.contains(file.id),
                                onClick = {
                                    when {
                                        file.isFolder && file.locked -> unlock = file
                                        file.isFolder -> expanded = if (expanded.contains(file.id)) expanded - file.id else expanded + file.id
                                        else -> openOverlay(file.id)
                                    }
                                },
                            )
                            HorizontalDivider(color = Divider, modifier = Modifier.padding(start = (52 + file.depth * 18).dp))
                        }
                    }
                }
            }
        }
    }
    if (newNote) NewNoteDialog(
        dismiss = { newNote = false },
        create = { title, content ->
            scope.launch {
                runCatching { state.api.createNote(token, title, content) }
                    .onSuccess { newNote = false; load(); openOverlay(it.id) }
                    .onFailure(state::handle)
            }
        },
    )
    unlock?.let { folder ->
        UnlockDialog(folder.name, { unlock = null }) { password ->
            scope.launch {
                runCatching { state.api.openEncryptedFolder(token, folder.id, password) }
                    .onSuccess { unlock = null; expanded = expanded + folder.id; load() }
                    .onFailure(state::handle)
            }
        }
    }
}

@Composable
private fun FileRow(file: FileNode, expanded: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick)
            .padding(start = (file.depth * 18).dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(fileAccentSoft(file)), contentAlignment = Alignment.Center) {
            Icon(fileIcon(file), null, tint = fileAccent(file), modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(file.name.removeSuffix(".md").removeSuffix(".json"), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!file.isFolder) Text(fileKind(file), style = MaterialTheme.typography.bodyMedium, color = Muted)
        }
        if (file.locked) Icon(Icons.Rounded.Lock, "Verrouillé", tint = Muted, modifier = Modifier.size(19.dp))
        else if (file.isFolder) Icon(if (expanded) Icons.Rounded.ExpandMore else Icons.Rounded.ChevronRight, null, tint = Muted)
        else Icon(Icons.Rounded.ChevronRight, null, tint = Muted)
    }
}

@Composable
fun FileViewerScreen(state: AppState, id: String, onBack: () -> Unit, openLinkedFile: (String) -> Unit = {}) {
    val token = state.token ?: return
    var detail by remember(id) { mutableStateOf<FileDetail?>(null) }
    var loading by remember(id) { mutableStateOf(true) }
    var error by remember(id) { mutableStateOf<String?>(null) }
    var editing by remember(id) { mutableStateOf(false) }
    var draft by remember(id) { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        loading = true
        error = null
        runCatching { state.api.file(token, id) }
            .onSuccess { detail = it; draft = it.content }
            .onFailure { error = it.message }
        loading = false
    }
    LaunchedEffect(id) { load() }
    BackHandler {
        if (editing) editing = false else onBack()
    }
    fun openWikiLink(target: String) = scope.launch {
        runCatching { state.api.resolveWikiLink(token, target) }
            .onSuccess { linkedId ->
                if (linkedId == null) state.notify("Le fichier « $target » est introuvable.", "warning")
                else openLinkedFile(linkedId)
            }
            .onFailure(state::handle)
    }

    DetailScaffold(
        detail?.name?.removeSuffix(".md")?.removeSuffix(".json") ?: "Fichier",
        { if (editing) editing = false else onBack() },
        action = {
            if (detail?.name?.endsWith(".md", true) == true && detail?.canEdit == true) {
                IconButton(onClick = {
                    if (editing) {
                        scope.launch {
                            saving = true
                            runCatching { state.api.updateFile(token, detail!!, draft) }
                                .onSuccess { detail = it; editing = false; state.notify("Note enregistrée") }
                                .onFailure(state::handle)
                            saving = false
                        }
                    } else editing = true
                }, enabled = !saving) {
                    Icon(if (editing) Icons.Rounded.Save else Icons.Rounded.Edit, if (editing) "Enregistrer" else "Modifier", tint = if (editing) Opuscule else Ink)
                }
            }
        },
    ) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding)) { LoadingPane() }
            error != null -> Box(Modifier.fillMaxSize().padding(padding)) { ErrorPane(error.orEmpty(), ::load) }
            detail != null -> AnimatedContent(
                editing,
                Modifier.fillMaxSize().padding(padding),
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "file-mode",
            ) { edit ->
                if (edit) {
                    OutlinedTextField(
                        draft,
                        { draft = it },
                        Modifier.fillMaxSize().padding(16.dp),
                        label = { Text("Markdown") },
                        shape = RoundedCornerShape(15.dp),
                    )
                } else {
                    FileReader(detail!!, ::openWikiLink)
                }
            }
        }
    }
}

@Composable
private fun FileReader(file: FileDetail, onWikiLink: (String) -> Unit) {
    val json = remember(file.content) { runCatching { JSONObject(file.content) }.getOrNull() }
    val kind = json?.optString("philoweek_type")
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 22.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        when {
            file.name.endsWith(".md", true) && kind != "graph" -> ReaderPaper { MarkdownView(stripFrontmatter(file.content), onWikiLink = onWikiLink) }
            kind == "questionnaire" -> QuestionnaireReader(json, onWikiLink)
            kind == "definitions" -> DefinitionsReader(json, onWikiLink)
            kind == "actor_network" -> ActorNetworkReader(json, onWikiLink)
            kind == "spreadsheet" || file.name.endsWith(".xlsx", true) -> SpreadsheetReader(json)
            kind == "graph" || file.content.contains("```philoweek-graph") -> GraphReader(file.content, json, onWikiLink)
            json != null -> GenericJsonReader(json)
            else -> ReaderPaper { MarkdownView(file.content, onWikiLink = onWikiLink) }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun QuestionnaireReader(json: JSONObject, onWikiLink: (String) -> Unit) {
    ReaderTitle(json.optString("title", "Questionnaire"), json.optString("description"), Icons.Rounded.Quiz)
    val array = json.optJSONArray("questions") ?: JSONArray()
    val rows = array.jsonObjects()
    rows.forEachIndexed { index, row ->
        Column(Modifier.fillMaxWidth().animateContentSize().padding(vertical = 9.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("QUESTION ${index + 1}", style = MaterialTheme.typography.labelMedium, color = Opuscule)
            MarkdownView(row.optString("prompt"), onWikiLink = onWikiLink)
            if (row.optString("answer").isNotBlank()) MarkdownView(row.optString("answer"), onWikiLink = onWikiLink)
        }
        if (index < rows.lastIndex) HorizontalDivider(color = Divider)
    }
}

@Composable
private fun DefinitionsReader(json: JSONObject, onWikiLink: (String) -> Unit) {
    ReaderTitle(json.optString("title", "Définitions"), json.optString("description"), Icons.AutoMirrored.Rounded.MenuBook)
    val array = json.optJSONArray("definitions") ?: JSONArray()
    array.jsonObjects().forEachIndexed { index, row ->
        Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(row.optString("term", row.optString("word")), style = MaterialTheme.typography.titleLarge)
            MarkdownView(row.optString("definition"), onWikiLink = onWikiLink)
            row.optString("example").takeIf(String::isNotBlank)?.let { MarkdownView(it, onWikiLink = onWikiLink) }
        }
        if (index < array.length() - 1) HorizontalDivider(color = Divider)
    }
}

@Composable
private fun ActorNetworkReader(json: JSONObject, onWikiLink: (String) -> Unit) {
    ReaderTitle(json.optString("title", "Réseau d’acteurs"), json.optString("description"), Icons.Rounded.Groups)
    val array = json.optJSONArray("nodes") ?: JSONArray()
    array.jsonObjects().forEachIndexed { index, row ->
        Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.Top) {
            val image = row.optJSONArray("images")?.optJSONObject(0)?.optString("src").orEmpty()
            if (image.isNotBlank()) {
                AsyncImage(image, row.optString("name"), Modifier.size(58.dp).clip(RoundedCornerShape(16.dp)))
                Spacer(Modifier.width(13.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(row.optString("name", row.optString("title")), style = MaterialTheme.typography.titleMedium)
                row.optString("subtitle").takeIf(String::isNotBlank)?.let { Text(it, color = Opuscule, style = MaterialTheme.typography.bodyMedium) }
                row.optString("summary", row.optString("details")).takeIf(String::isNotBlank)?.let { MarkdownView(it, onWikiLink = onWikiLink) }
            }
        }
        if (index < array.length() - 1) HorizontalDivider(color = Divider)
    }
}

@Composable
private fun SpreadsheetReader(json: JSONObject?) {
    if (json == null) {
        ReaderTitle("Tableur", "Aperçu indisponible", Icons.Rounded.Calculate)
        return
    }
    val sheets = json.optJSONArray("sheets") ?: JSONArray()
    ReaderTitle(json.optString("title", "Tableur"), "${sheets.length()} feuille(s)", Icons.Rounded.Calculate)
    sheets.jsonObjects().forEach { sheet ->
        SurfaceGroup {
            Text(sheet.optString("name", "Feuille"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(vertical = 11.dp))
            val cells = sheet.optJSONObject("cells")
            if (cells == null || cells.length() == 0) Text("Feuille vide", color = Muted, modifier = Modifier.padding(bottom = 11.dp))
            else cells.keys().asSequence().take(8).forEach { key ->
                val value = cells.optJSONObject(key)?.opt("value") ?: cells.opt(key)
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) {
                    Text(key, Modifier.width(60.dp), color = Muted, style = MaterialTheme.typography.labelMedium)
                    Text(value?.toString().orEmpty(), style = MaterialTheme.typography.bodyMedium, maxLines = 2)
                }
            }
        }
    }
}

@Composable
private fun GraphReader(content: String, parsed: JSONObject?, onWikiLink: (String) -> Unit) {
    val block = Regex("```philoweek-graph\\s*([\\s\\S]*?)```").find(content)?.groupValues?.getOrNull(1)
    val json = parsed ?: block?.let { runCatching { JSONObject(it) }.getOrNull() }
    ReaderTitle(json?.optString("title", "Graphe d’idées") ?: "Graphe d’idées", "Vue mobile des cartes", Icons.Rounded.AccountTree)
    val nodes = json?.optJSONArray("nodes").jsonObjects()
    nodes.forEachIndexed { index, row ->
        SurfaceGroup {
            Text(row.optString("type", "Idée").uppercase(), style = MaterialTheme.typography.labelMedium, color = Opuscule, modifier = Modifier.padding(top = 10.dp))
            Text(row.optString("title"), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(vertical = 5.dp))
            row.optString("body").takeIf(String::isNotBlank)?.let { MarkdownView(it, Modifier.padding(bottom = 10.dp), onWikiLink) }
        }
        if (index < nodes.lastIndex) Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun GenericJsonReader(json: JSONObject) {
    ReaderTitle(json.optString("title", "Document Opuscule"), json.optString("description", "Fichier structuré"), Icons.Rounded.Description)
    json.keys().asSequence().filterNot { it in setOf("title", "description", "content", "nodes", "questions", "definitions", "sheets") }.take(12).forEach { key ->
        val value = json.opt(key)
        if (value !is JSONObject && value !is JSONArray) {
            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp)) {
                Text(key.replace('_', ' '), Modifier.weight(.42f), color = Muted, style = MaterialTheme.typography.bodyMedium)
                Text(value?.toString().orEmpty(), Modifier.weight(.58f), style = MaterialTheme.typography.bodyMedium)
            }
            HorizontalDivider(color = Divider)
        }
    }
}

@Composable
private fun ReaderTitle(title: String, description: String, icon: ImageVector) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.size(48.dp).clip(RoundedCornerShape(15.dp)).background(OpusculeSoft), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Opuscule)
        }
        Column(Modifier.padding(start = 13.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.headlineMedium)
            if (description.isNotBlank()) Text(description, color = Muted, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun ReaderPaper(content: @Composable () -> Unit) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(ReadingPaper)
            .border(1.dp, Divider.copy(alpha = .7f), RoundedCornerShape(18.dp))
            .padding(horizontal = 19.dp, vertical = 18.dp),
    ) {
        content()
    }
}

@Composable
private fun NewNoteDialog(dismiss: () -> Unit, create: (String, String) -> Unit) {
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Nouvelle note") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("Titre") }, singleLine = true)
                OutlinedTextField(content, { content = it }, label = { Text("Premières lignes") }, minLines = 4)
            }
        },
        confirmButton = { TextButton(onClick = { create(title.trim(), content) }, enabled = title.isNotBlank()) { Text("Créer", color = Opuscule) } },
        dismissButton = { TextButton(onClick = dismiss) { Text("Annuler", color = Muted) } },
        shape = RoundedCornerShape(22.dp),
        containerColor = Canvas,
    )
}

@Composable
private fun UnlockDialog(name: String, dismiss: () -> Unit, unlock: (String) -> Unit) {
    var password by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = dismiss,
        icon = { Icon(Icons.Rounded.Key, null, tint = Opuscule) },
        title = { Text("Ouvrir $name") },
        text = { OutlinedTextField(password, { password = it }, label = { Text("Mot de passe du coffre") }, singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()) },
        confirmButton = { TextButton(onClick = { unlock(password) }, enabled = password.isNotBlank()) { Text("Ouvrir", color = Opuscule) } },
        dismissButton = { TextButton(onClick = dismiss) { Text("Annuler", color = Muted) } },
        shape = RoundedCornerShape(22.dp),
        containerColor = Canvas,
    )
}

private fun visibleFiles(roots: List<FileNode>, expanded: Set<String>, query: String): List<FileNode> {
    if (query.isNotBlank()) return flattenFiles(roots).filter { it.name.contains(query.trim(), ignoreCase = true) }
    val result = mutableListOf<FileNode>()
    fun walk(nodes: List<FileNode>) {
        nodes.forEach {
            result += it
            if (it.isFolder && expanded.contains(it.id)) walk(it.children)
        }
    }
    walk(roots)
    return result
}

fun flattenFiles(roots: List<FileNode>): List<FileNode> = buildList {
    fun walk(nodes: List<FileNode>) {
        nodes.forEach { add(it); walk(it.children) }
    }
    walk(roots)
}

private fun fileIcon(file: FileNode): ImageVector = when {
    file.isFolder && file.locked -> Icons.Rounded.Lock
    file.isFolder -> Icons.Rounded.Folder
    file.name.endsWith(".md", true) -> Icons.Rounded.Description
    file.name.endsWith(".xlsx", true) -> Icons.Rounded.Calculate
    file.name.contains("definition", true) -> Icons.AutoMirrored.Rounded.MenuBook
    file.name.contains("réseau", true) || file.name.contains("network", true) -> Icons.Rounded.Groups
    else -> Icons.Rounded.Quiz
}

private fun fileKind(file: FileNode): String = when {
    file.name.endsWith(".md", true) -> "Note Markdown"
    file.name.endsWith(".xlsx", true) -> "Tableur"
    file.name.endsWith(".json", true) -> "Document Opuscule"
    else -> "Fichier"
}

private fun fileAccent(file: FileNode): Color = when {
    file.isFolder -> Amber
    file.name.endsWith(".md", true) -> KnowledgeBlue
    file.name.endsWith(".xlsx", true) -> Sage
    file.name.contains("definition", true) -> Coral
    file.name.contains("réseau", true) || file.name.contains("network", true) -> Sage
    else -> Opuscule
}

private fun fileAccentSoft(file: FileNode): Color = when (fileAccent(file)) {
    Amber -> AmberSoft
    KnowledgeBlue -> KnowledgeBlueSoft
    Sage -> SageSoft
    Coral -> CoralSoft
    else -> OpusculeSoft
}

private fun stripFrontmatter(value: String): String =
    value.replace(Regex("^---\\s*[\\s\\S]*?\\s*---\\s*"), "")

private fun JSONArray?.jsonObjects(): List<JSONObject> =
    if (this == null) emptyList() else (0 until length()).mapNotNull(::optJSONObject)
