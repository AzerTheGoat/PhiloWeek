package fr.opuscule.android.ui

import android.text.method.LinkMovementMethod
import android.text.Spannable
import android.text.style.URLSpan
import android.net.Uri
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.widget.TextView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import fr.opuscule.android.AppState
import fr.opuscule.android.data.DictionaryEntry
import io.noties.markwon.Markwon
import io.noties.markwon.ext.tables.TablePlugin
import kotlinx.coroutines.launch

@Composable
fun OpusculeLogo(modifier: Modifier = Modifier, compact: Boolean = false) {
    val logoSize = if (compact) 36.dp else 76.dp
    Box(
        modifier.size(logoSize).clip(RoundedCornerShape(if (compact) 11.dp else 23.dp)).background(Ink),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(if (compact) 21.dp else 43.dp)) {
            val stroke = Stroke(width = if (compact) 2.4.dp.toPx() else 4.dp.toPx())
            val path = Path().apply {
                moveTo(center.x, size.height * .08f)
                cubicTo(size.width * .82f, size.height * .18f, size.width * .9f, size.height * .52f, center.x, size.height * .92f)
                cubicTo(size.width * .1f, size.height * .52f, size.width * .18f, size.height * .18f, center.x, size.height * .08f)
            }
            drawPath(path, Color.White, style = stroke)
            drawCircle(Opuscule, radius = size.minDimension * .12f, center = center)
        }
    }
}

@Composable
fun ScreenHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    val compact = LocalCompactInterface.current
    Row(
        modifier.fillMaxWidth().statusBarsPadding().padding(
            horizontal = 20.dp,
            vertical = if (compact) 7.dp else 13.dp,
        ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                title,
                style = if (compact) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineMedium,
            )
            subtitle?.takeUnless { compact }?.let {
                Text(
                    it,
                    style = if (compact) MaterialTheme.typography.labelMedium else MaterialTheme.typography.bodyMedium,
                    color = Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        action?.invoke()
    }
}

@Composable
fun DetailScaffold(
    title: String,
    onBack: () -> Unit,
    action: (@Composable () -> Unit)? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    val compact = LocalCompactInterface.current
    Scaffold(
        containerColor = Canvas,
        topBar = {
            Column(Modifier.background(Canvas).statusBarsPadding()) {
                Row(
                    Modifier.fillMaxWidth().height(if (compact) 46.dp else 54.dp).padding(horizontal = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Retour", tint = Ink)
                    }
                    Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    action?.invoke()
                }
                HorizontalDivider(color = Divider)
            }
        },
        content = content,
    )
}

@Composable
fun ActionRow(
    title: String,
    subtitle: String? = null,
    icon: ImageVector,
    onClick: () -> Unit,
    destructive: Boolean = false,
    accent: Color = Opuscule,
    accentSoft: Color = OpusculeSoft,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(42.dp).clip(RoundedCornerShape(13.dp))
                .background(if (destructive) DangerSoft else accentSoft),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = if (destructive) Danger else accent, modifier = Modifier.size(21.dp))
        }
        Spacer(Modifier.width(13.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = if (destructive) Danger else Ink)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Muted, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
        if (trailing != null) trailing() else Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Muted)
    }
}

@Composable
fun SectionLabel(value: String) {
    Text(
        value.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = Muted,
        letterSpacing = 0.8.sp,
        modifier = Modifier.padding(top = 8.dp, bottom = 5.dp),
    )
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick,
        modifier.height(54.dp),
        enabled = enabled,
        shape = RoundedCornerShape(15.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Ink, contentColor = Color.White, disabledContainerColor = Divider),
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedButton(
        onClick,
        modifier.height(52.dp),
        enabled = enabled,
        shape = RoundedCornerShape(15.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Divider),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Ink),
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}

@Composable
fun LoadingPane(label: String = "Chargement…") {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(13.dp)) {
            CircularProgressIndicator(Modifier.size(26.dp), color = Opuscule, strokeWidth = 2.5.dp)
            Text(label, style = MaterialTheme.typography.bodyMedium, color = Muted)
        }
    }
}

@Composable
fun EmptyPane(title: String, message: String, icon: ImageVector, action: String? = null, onAction: (() -> Unit)? = null) {
    Box(Modifier.fillMaxSize().padding(34.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(58.dp).clip(CircleShape).background(Surface), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = Ink)
            }
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(message, style = MaterialTheme.typography.bodyMedium, color = Muted)
            if (action != null && onAction != null) SecondaryButton(action, onAction)
        }
    }
}

@Composable
fun ErrorPane(message: String, retry: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(30.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Impossible de charger", style = MaterialTheme.typography.titleLarge)
            Text(message, style = MaterialTheme.typography.bodyMedium, color = Muted)
            SecondaryButton("Réessayer", retry)
        }
    }
}

@Composable
fun InlineNotice(message: String, visible: Boolean) {
    AnimatedVisibility(
        visible,
        enter = fadeIn() + slideInVertically { it / 2 },
        exit = fadeOut() + slideOutVertically { it / 2 },
    ) {
        Text(
            message,
            color = Success,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(SuccessSoft).padding(12.dp),
        )
    }
}

@Composable
fun MarkdownView(markdown: String, modifier: Modifier = Modifier, onWikiLink: ((String) -> Unit)? = null) {
    val context = LocalContext.current
    val state: AppState = viewModel()
    var selectedWord by remember { mutableStateOf<String?>(null) }
    val markwon = remember {
        Markwon.builder(context).usePlugin(TablePlugin.create(context)).build()
    }
    AndroidView(
        modifier = modifier.fillMaxWidth(),
        factory = {
            TextView(it).apply {
                setTextColor(Ink.toArgbCompat())
                textSize = 17f
                setLineSpacing(0f, 1.22f)
                movementMethod = if (onWikiLink == null) LinkMovementMethod.getInstance() else WikiLinkMovementMethod(onWikiLink)
                setTextIsSelectable(true)
                fun selectedDictionaryWord(): String? {
                    val start = selectionStart.coerceAtLeast(0)
                    val end = selectionEnd.coerceAtLeast(start)
                    val selected = text.substring(start, end).trim()
                    return Regex("[\\p{L}]+(?:[-’'][\\p{L}]+)*").find(selected)?.value
                        ?.takeIf { selected.matches(Regex("\\s*[^\\s]+\\s*")) && it.length <= 80 }
                }
                customSelectionActionModeCallback = object : ActionMode.Callback {
                    override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
                        menu.add(0, 9137, 10, "Dictionnaire")
                            .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
                        post {
                            selectedDictionaryWord()?.let { word ->
                                selectedWord = word
                                mode.finish()
                            }
                        }
                        return true
                    }
                    override fun onPrepareActionMode(mode: ActionMode, menu: Menu) = false
                    override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
                        if (item.itemId != 9137) return false
                        selectedDictionaryWord()?.let { selectedWord = it }
                        mode.finish()
                        return true
                    }
                    override fun onDestroyActionMode(mode: ActionMode) = Unit
                }
            }
        },
        update = {
            it.movementMethod = if (onWikiLink == null) LinkMovementMethod.getInstance() else WikiLinkMovementMethod(onWikiLink)
            markwon.setMarkdown(it, expandWikiLinks(markdown))
        },
    )
    selectedWord?.let { DictionaryDialog(state, it) { selectedWord = null } }
}

private fun expandWikiLinks(markdown: String): String =
    Regex("\\[\\[([^\\]]+)]]").replace(markdown) { match ->
        val raw = match.groupValues[1]
        val target = raw.substringBefore('|').trim()
        val label = raw.substringAfter('|', target).trim().replace("[", "\\[").replace("]", "\\]")
        if (target.isBlank()) match.value else "[$label](https://opuscule.local/wiki/${Uri.encode(target)})"
    }

private class WikiLinkMovementMethod(private val openWikiLink: (String) -> Unit) : LinkMovementMethod() {
    override fun onTouchEvent(widget: TextView, buffer: Spannable, event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_UP) {
            val x = (event.x - widget.totalPaddingLeft + widget.scrollX).toInt()
            val y = (event.y - widget.totalPaddingTop + widget.scrollY).toInt()
            val layout = widget.layout
            if (y in 0..layout.height) {
                val line = layout.getLineForVertical(y)
                val offset = layout.getOffsetForHorizontal(line, x.toFloat())
                val span = buffer.getSpans(offset, offset, URLSpan::class.java).firstOrNull()
                val prefix = "https://opuscule.local/wiki/"
                if (span?.url?.startsWith(prefix) == true) {
                    openWikiLink(Uri.decode(span.url.removePrefix(prefix)))
                    return true
                }
            }
        }
        return super.onTouchEvent(widget, buffer, event)
    }
}

@Composable
private fun DictionaryDialog(state: AppState, word: String, dismiss: () -> Unit) {
    val token = state.token ?: return
    var language by remember(word) { mutableStateOf("fr") }
    var entry by remember(word) { mutableStateOf<DictionaryEntry?>(null) }
    var loading by remember(word) { mutableStateOf(false) }
    var error by remember(word) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun lookup(nextLanguage: String) {
        language = nextLanguage
        loading = true
        error = null
        entry = null
        scope.launch {
            runCatching { state.api.dictionary(token, word, nextLanguage) }
                .onSuccess { entry = it }
                .onFailure { error = it.message }
            loading = false
        }
    }
    androidx.compose.runtime.LaunchedEffect(word) { lookup("fr") }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Dictionnaire · $word") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { lookup("fr") }, colors = ButtonDefaults.textButtonColors(contentColor = if (language == "fr") Opuscule else Muted)) { Text("Français") }
                    TextButton(onClick = { lookup("en") }, colors = ButtonDefaults.textButtonColors(contentColor = if (language == "en") Opuscule else Muted)) { Text("English") }
                }
                when {
                    loading -> CircularProgressIndicator(Modifier.size(28.dp), color = Opuscule)
                    error != null -> Text(error.orEmpty(), color = Danger)
                    entry != null -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        entry!!.phonetic.takeIf(String::isNotBlank)?.let { Text(it, color = Muted) }
                        entry!!.definitions.take(6).forEachIndexed { index, definition ->
                            Column {
                                Text("${index + 1}. ${definition.definition}", style = MaterialTheme.typography.bodyMedium)
                                definition.partOfSpeech.takeIf(String::isNotBlank)?.let { Text(it, color = Opuscule, style = MaterialTheme.typography.labelMedium) }
                                definition.example.takeIf(String::isNotBlank)?.let { Text("« $it »", color = Muted, style = MaterialTheme.typography.bodySmall) }
                            }
                        }
                        Text("Source : ${entry!!.source}", color = Muted, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = dismiss) { Text("Fermer", color = Opuscule) } },
        shape = RoundedCornerShape(22.dp),
        containerColor = Canvas,
    )
}

private fun Color.toArgbCompat(): Int =
    android.graphics.Color.argb((alpha * 255).toInt(), (red * 255).toInt(), (green * 255).toInt(), (blue * 255).toInt())

@Composable
fun SurfaceGroup(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Surface).padding(horizontal = 16.dp, vertical = 7.dp),
        content = content,
    )
}
