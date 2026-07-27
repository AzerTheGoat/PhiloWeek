package fr.opuscule.android.ui

import android.content.Intent
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Newspaper
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import fr.opuscule.android.AppState
import fr.opuscule.android.data.Article
import fr.opuscule.android.data.Comment
import kotlinx.coroutines.launch

@Composable
fun ArticlesScreen(state: AppState, onDetailChange: (Boolean) -> Unit = {}) {
    val token = state.token ?: return
    var rows by remember { mutableStateOf<List<Article>>(emptyList()) }
    var selected by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    DisposableEffect(selected) {
        onDetailChange(selected != null)
        onDispose { if (selected != null) onDetailChange(false) }
    }
    fun load() = scope.launch {
        loading = true
        error = null
        runCatching { state.api.articles(token) }.onSuccess { rows = it }.onFailure { error = it.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }
    if (selected != null) {
        ArticleDetailScreen(state, selected!!) { selected = null; load() }
        return
    }
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Articles", subtitle = "Les publications de la communauté") {
            IconButton(onClick = { load() }, modifier = Modifier.clip(CircleShape).background(Surface)) {
                Icon(Icons.Rounded.Refresh, "Actualiser")
            }
        }
        when {
            loading -> LoadingPane()
            error != null -> ErrorPane(error.orEmpty(), ::load)
            rows.isEmpty() -> EmptyPane("Aucun article", "Les publications apparaîtront ici.", Icons.Rounded.Newspaper)
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 6.dp)) {
                items(rows, key = Article::id) { article ->
                    ArticleRow(article) { selected = article.id }
                    HorizontalDivider(color = Divider)
                }
            }
        }
    }
}

@Composable
private fun ArticleRow(article: Article, open: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = open).padding(vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(authorColor(article.author)), contentAlignment = Alignment.Center) {
                Text(article.author?.take(1)?.uppercase().orEmpty(), color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelMedium)
            }
            Text(article.author ?: "Compte supprimé", Modifier.padding(start = 9.dp).weight(1f), style = MaterialTheme.typography.labelLarge)
            Text(article.publishedOn.orEmpty(), color = Muted, style = MaterialTheme.typography.bodyMedium)
        }
        article.coverImage?.let { AsyncImage(articleImageModel(it), article.title, Modifier.fillMaxWidth().height(190.dp).clip(RoundedCornerShape(18.dp)).background(Surface)) }
        Text(article.title, style = MaterialTheme.typography.headlineMedium)
        article.excerpt?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = Muted, maxLines = 3, overflow = TextOverflow.Ellipsis) }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            MetaIcon(Icons.Rounded.FavoriteBorder, article.likeCount.toString())
            MetaIcon(Icons.Rounded.ChatBubbleOutline, article.commentCount.toString())
        }
    }
}

@Composable
private fun ArticleDetailScreen(state: AppState, id: String, back: () -> Unit) {
    val token = state.token ?: return
    var article by remember(id) { mutableStateOf<Article?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var comment by remember { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<Comment?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    fun load() = scope.launch {
        loading = true
        error = null
        runCatching { state.api.article(token, id) }.onSuccess { article = it }.onFailure { error = it.message }
        loading = false
    }
    LaunchedEffect(id) {
        load()
        runCatching { state.api.markArticleRead(token, id) }
    }
    BackHandler(onBack = back)
    DetailScaffold(
        article?.title ?: "Article",
        back,
        action = {
            IconButton(onClick = {
                shareArticle(context, state.api.publicBaseUrl + "/articles/$id", article?.title.orEmpty())
            }) { Icon(Icons.Rounded.Share, "Partager") }
            if (article?.canEdit == true) Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreHoriz, "Options") }
                DropdownMenu(menu, { menu = false }, containerColor = Canvas) {
                    DropdownMenuItem(
                        text = { Text("Supprimer", color = Danger) },
                        leadingIcon = { Icon(Icons.Rounded.Delete, null, tint = Danger) },
                        onClick = { menu = false; confirmDelete = true },
                    )
                }
            }
        },
    ) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding)) { LoadingPane() }
            error != null -> Box(Modifier.fillMaxSize().padding(padding)) { ErrorPane(error.orEmpty(), ::load) }
            article != null -> Column(
                Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                article!!.coverImage?.let { AsyncImage(articleImageModel(it), article!!.title, Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(20.dp)).background(Surface)) }
                Text(article!!.title, style = MaterialTheme.typography.displaySmall)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(article!!.author ?: "Compte supprimé", style = MaterialTheme.typography.labelLarge)
                    Text(" · ${article!!.publishedOn.orEmpty()}", color = Muted)
                }
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(ReadingPaper).padding(horizontal = 18.dp, vertical = 17.dp)) {
                    MarkdownView(article!!.content.orEmpty())
                }
                HorizontalDivider(color = Divider)
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = {
                        scope.launch { runCatching { state.api.toggleArticleLike(token, id) }.onSuccess { load() }.onFailure(state::handle) }
                    }) {
                        Icon(if (article!!.likedByMe) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, null, tint = if (article!!.likedByMe) Danger else Ink)
                        Text(" ${article!!.likeCount}", color = Ink)
                    }
                    Spacer(Modifier.width(10.dp))
                    Icon(Icons.Rounded.ChatBubbleOutline, null, tint = Ink)
                    Text(" ${article!!.commentCount}", color = Ink)
                }
                Text("Commentaires", style = MaterialTheme.typography.headlineMedium)
                val roots = article!!.comments.filter { it.parentId == null }
                roots.forEach { root ->
                    CommentView(root, false, {
                        replyTo = root
                    }, {
                        scope.launch { runCatching { state.api.deleteComment(token, root.id) }.onSuccess { load() }.onFailure(state::handle) }
                    })
                    article!!.comments.filter { it.parentId == root.id }.forEach { reply ->
                        CommentView(reply, true, {}, {
                            scope.launch { runCatching { state.api.deleteComment(token, reply.id) }.onSuccess { load() }.onFailure(state::handle) }
                        })
                    }
                    HorizontalDivider(color = Divider)
                }
                OutlinedTextField(comment, { comment = it }, Modifier.fillMaxWidth(), label = { Text("Ajouter un commentaire") }, minLines = 3, shape = RoundedCornerShape(15.dp))
                PrimaryButton("Publier le commentaire", {
                    scope.launch {
                        runCatching { state.api.addComment(token, id, comment.trim()) }
                            .onSuccess { comment = ""; load() }.onFailure(state::handle)
                    }
                }, Modifier.fillMaxWidth(), comment.isNotBlank())
                Spacer(Modifier.height(24.dp))
            }
        }
    }
    replyTo?.let { parent ->
        var body by remember(parent.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { replyTo = null },
            title = { Text("Répondre à ${parent.author ?: "ce commentaire"}") },
            text = { OutlinedTextField(body, { body = it }, label = { Text("Votre réponse") }, minLines = 3) },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        runCatching { state.api.addComment(token, id, body.trim(), parent.id) }
                            .onSuccess { replyTo = null; load() }.onFailure(state::handle)
                    }
                }, enabled = body.isNotBlank()) { Text("Publier", color = Opuscule) }
            },
            dismissButton = { TextButton(onClick = { replyTo = null }) { Text("Annuler", color = Muted) } },
            shape = RoundedCornerShape(22.dp),
            containerColor = Canvas,
        )
    }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Supprimer cet article ?") },
        text = { Text("L’article et ses commentaires seront supprimés définitivement.") },
        confirmButton = {
            TextButton(onClick = {
                scope.launch {
                    runCatching { state.api.deleteArticle(token, id) }
                        .onSuccess { confirmDelete = false; back() }.onFailure(state::handle)
                }
            }) { Text("Supprimer", color = Danger) }
        },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Annuler", color = Muted) } },
        shape = RoundedCornerShape(22.dp),
        containerColor = Canvas,
    )
}

@Composable
private fun CommentView(comment: Comment, reply: Boolean, onReply: () -> Unit, onDelete: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(start = if (reply) 24.dp else 0.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.size(30.dp).clip(CircleShape).background(Surface), contentAlignment = Alignment.Center) {
            Text(comment.author?.take(1)?.uppercase().orEmpty(), style = MaterialTheme.typography.labelMedium)
        }
        Column(Modifier.padding(start = 10.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(comment.author ?: "Compte supprimé", style = MaterialTheme.typography.labelLarge)
            Text(comment.body, style = MaterialTheme.typography.bodyLarge)
            Row {
                if (!reply) TextButton(onClick = onReply) {
                    Icon(Icons.AutoMirrored.Rounded.Reply, null, modifier = Modifier.size(16.dp))
                    Text(" Répondre", color = Muted)
                }
                if (comment.canEdit) TextButton(onClick = onDelete) { Text("Supprimer", color = Danger) }
            }
        }
    }
}

@Composable
private fun MetaIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = Muted, modifier = Modifier.size(18.dp))
        Text(" $text", color = Muted, style = MaterialTheme.typography.bodyMedium)
    }
}

private fun shareArticle(context: android.content.Context, url: String, title: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, "$title\n$url")
    }
    context.startActivity(Intent.createChooser(intent, "Partager l’article"))
}

private fun articleImageModel(value: String): Any {
    if (!value.startsWith("data:image/", ignoreCase = true)) return value
    val encoded = value.substringAfter(',', "")
    return runCatching { Base64.decode(encoded, Base64.DEFAULT) }.getOrElse { value }
}

@Composable
private fun authorColor(author: String?): androidx.compose.ui.graphics.Color {
    val colors = listOf(Opuscule, KnowledgeBlue, Sage, Amber, Coral)
    return colors[(author.orEmpty().hashCode() and Int.MAX_VALUE) % colors.size]
}
