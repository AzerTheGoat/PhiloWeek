package fr.opuscule.android.ui

import android.graphics.BitmapFactory
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.method.LinkMovementMethod
import android.text.Spannable
import android.text.Spanned
import android.text.style.ForegroundColorSpan
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
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.asImageBitmap
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
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.core.MarkwonTheme
import io.noties.markwon.core.spans.HeadingSpan
import io.noties.markwon.ext.tables.TablePlugin
import kotlinx.coroutines.launch

@Composable
fun Modifier.opusculeStatusBarsPadding(): Modifier {
    val systemInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    return padding(top = systemInset.coerceAtMost(36.dp))
}

@Composable
fun OpusculeLogo(modifier: Modifier = Modifier, compact: Boolean = false) {
    val logoSize = if (compact) 36.dp else 76.dp
    val foreground = MaterialTheme.colorScheme.onPrimary
    Box(
        modifier.size(logoSize).clip(RoundedCornerShape(if (compact) 11.dp else 23.dp)).background(Opuscule),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(if (compact) 21.dp else 43.dp)) {
            val stroke = Stroke(width = if (compact) 2.4.dp.toPx() else 4.dp.toPx())
            val path = Path().apply {
                moveTo(center.x, size.height * .08f)
                cubicTo(size.width * .82f, size.height * .18f, size.width * .9f, size.height * .52f, center.x, size.height * .92f)
                cubicTo(size.width * .1f, size.height * .52f, size.width * .18f, size.height * .18f, center.x, size.height * .08f)
            }
            drawPath(path, foreground, style = stroke)
            drawCircle(foreground, radius = size.minDimension * .12f, center = center)
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
    Column(modifier.fillMaxWidth().background(Surface).opusculeStatusBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().height(if (compact) 44.dp else 50.dp).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(
                    title,
                    style = if (compact) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                subtitle?.takeUnless { compact }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelMedium,
                        color = Muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Box(Modifier.height(40.dp), contentAlignment = Alignment.Center) { action?.invoke() }
        }
        HorizontalDivider(color = Divider.copy(alpha = .65f))
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
            Column(Modifier.background(Surface).opusculeStatusBarsPadding()) {
                Row(
                    Modifier.fillMaxWidth().height(if (compact) 44.dp else 50.dp).padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack, modifier = Modifier.size(38.dp)) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Retour", tint = Ink)
                    }
                    Text(
                        title,
                        Modifier.weight(1f).padding(horizontal = 6.dp),
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Box(Modifier.height(38.dp), contentAlignment = Alignment.Center) { action?.invoke() }
                }
                HorizontalDivider(color = Divider.copy(alpha = .65f))
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
        colors = ButtonDefaults.buttonColors(
            containerColor = Opuscule,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            disabledContainerColor = Divider,
            disabledContentColor = Muted,
        ),
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
    val parts = remember(markdown) { splitMarkdown(markdown) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        parts.forEachIndexed { index, part ->
            when (part) {
                is MarkdownPart.Text -> if (part.value.isNotBlank()) {
                    NativeMarkdownText(part.value, Modifier.fillMaxWidth(), onWikiLink)
                }
                is MarkdownPart.Mermaid -> MermaidDiagram(part.value, index)
            }
        }
    }
}

@Composable
private fun NativeMarkdownText(markdown: String, modifier: Modifier, onWikiLink: ((String) -> Unit)?) {
    val context = LocalContext.current
    val state: AppState = viewModel()
    val readingFontSize = LocalReadingFontSize.current
    val ink = Ink
    val accent = Opuscule
    val accentSoft = OpusculeSoft
    val surface = Surface
    val divider = Divider
    var selectedWord by remember { mutableStateOf<String?>(null) }
    val markwon = remember(context, ink, accent, surface, divider) {
        Markwon.builder(context)
            .usePlugin(object : AbstractMarkwonPlugin() {
                override fun configureTheme(builder: MarkwonTheme.Builder) {
                    builder
                        .linkColor(accent.toArgbCompat())
                        .isLinkUnderlined(false)
                        .blockQuoteColor(accent.toArgbCompat())
                        .listItemColor(accent.toArgbCompat())
                        .codeTextColor(accent.toArgbCompat())
                        .codeBlockTextColor(ink.toArgbCompat())
                        .codeBackgroundColor(surface.toArgbCompat())
                        .codeBlockBackgroundColor(surface.toArgbCompat())
                        .headingBreakColor(divider.toArgbCompat())
                        .thematicBreakColor(divider.toArgbCompat())
                        .headingTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD))
                        .headingTextSizeMultipliers(floatArrayOf(1.75f, 1.42f, 1.22f, 1.08f, 1f, .96f))
                }
            })
            .usePlugin(TablePlugin.create(context))
            .build()
    }
    AndroidView(
        modifier = modifier,
        factory = {
            TextView(it).apply {
                setTextColor(ink.toArgbCompat())
                setLinkTextColor(accent.toArgbCompat())
                setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, readingFontSize)
                setLineSpacing(4f, 1.28f)
                highlightColor = accentSoft.toArgbCompat()
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
            it.setTextColor(ink.toArgbCompat())
            it.setLinkTextColor(accent.toArgbCompat())
            it.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, readingFontSize)
            it.highlightColor = accentSoft.toArgbCompat()
            it.movementMethod = if (onWikiLink == null) LinkMovementMethod.getInstance() else WikiLinkMovementMethod(onWikiLink)
            val rendered = SpannableStringBuilder(markwon.toMarkdown(expandWikiLinks(markdown)))
            rendered.getSpans(0, rendered.length, HeadingSpan::class.java).forEach { heading ->
                val color = if (heading.level <= 2) accent else ink
                rendered.setSpan(
                    ForegroundColorSpan(color.toArgbCompat()),
                    rendered.getSpanStart(heading),
                    rendered.getSpanEnd(heading),
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
                )
            }
            markwon.setParsedMarkdown(it, rendered)
        },
    )
    selectedWord?.let { DictionarySheet(state, it) { selectedWord = null } }
}

private sealed interface MarkdownPart {
    data class Text(val value: String) : MarkdownPart
    data class Mermaid(val value: String) : MarkdownPart
}

private fun splitMarkdown(markdown: String): List<MarkdownPart> {
    val pattern = Regex("```mermaid\\s*\\n?([\\s\\S]*?)```", RegexOption.IGNORE_CASE)
    val result = mutableListOf<MarkdownPart>()
    var cursor = 0
    pattern.findAll(markdown).take(20).forEach { match ->
        if (match.range.first > cursor) result += MarkdownPart.Text(markdown.substring(cursor, match.range.first))
        result += MarkdownPart.Mermaid(match.groupValues[1].trim())
        cursor = match.range.last + 1
    }
    if (cursor < markdown.length) result += MarkdownPart.Text(markdown.substring(cursor))
    return result.ifEmpty { listOf(MarkdownPart.Text(markdown)) }
}

@Composable
private fun MermaidDiagram(source: String, key: Int) {
    val state: AppState = viewModel()
    val token = state.token
    val dark = LocalIsDarkTheme.current
    var image by remember(source) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var error by remember(source) { mutableStateOf<String?>(null) }
    var retry by remember(source) { mutableStateOf(0) }
    LaunchedEffect(source, retry, token, dark) {
        if (token == null || source.isBlank()) {
            error = "Diagramme Mermaid vide."
            return@LaunchedEffect
        }
        image = null
        error = null
        runCatching { state.api.renderMermaid(token, source, dark) }
            .onSuccess { bytes ->
                image = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                if (image == null) error = "Image Mermaid illisible."
            }
            .onFailure { error = it.message ?: "Rendu Mermaid indisponible." }
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(Surface).border(1.dp, Divider, RoundedCornerShape(16.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("DIAGRAMME", style = MaterialTheme.typography.labelMedium, color = Opuscule)
            Text("  Mermaid", style = MaterialTheme.typography.labelMedium, color = Ink)
        }
        when {
            image != null -> androidx.compose.foundation.Image(
                image!!,
                contentDescription = "Diagramme Mermaid ${key + 1}",
                modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp, max = 520.dp),
                contentScale = androidx.compose.ui.layout.ContentScale.Fit,
            )
            error != null -> {
                Text(error.orEmpty(), color = Danger, style = MaterialTheme.typography.bodyMedium)
                Text(source, color = Ink, style = MaterialTheme.typography.bodySmall, maxLines = 10, overflow = TextOverflow.Ellipsis)
                TextButton(onClick = { retry++ }) { Text("Réessayer", color = Opuscule) }
            }
            else -> Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(26.dp), color = Opuscule, strokeWidth = 2.5.dp)
            }
        }
    }
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DictionarySheet(state: AppState, word: String, dismiss: () -> Unit) {
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
    ModalBottomSheet(
        onDismissRequest = dismiss,
        containerColor = ReadingPaper,
        contentColor = Ink,
    ) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 22.dp).padding(bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(word, style = MaterialTheme.typography.headlineMedium, color = Ink)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("fr" to "Français", "en" to "English").forEach { (code, label) ->
                    Text(
                        label,
                        color = if (language == code) Opuscule else Ink,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(20.dp))
                            .background(if (language == code) OpusculeSoft else Surface)
                            .clickable { lookup(code) }.padding(horizontal = 15.dp, vertical = 9.dp),
                    )
                }
            }
            Column(
                Modifier.fillMaxWidth().heightIn(max = 520.dp)
                    .verticalScroll(androidx.compose.foundation.rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                when {
                    loading -> CircularProgressIndicator(Modifier.size(28.dp), color = Opuscule)
                    error != null -> Text(error.orEmpty(), color = Danger, style = MaterialTheme.typography.bodyLarge)
                    entry != null -> Column(verticalArrangement = Arrangement.spacedBy(15.dp)) {
                        entry!!.phonetic.takeIf(String::isNotBlank)?.let {
                            Text(it, color = Ink, style = MaterialTheme.typography.bodyLarge)
                        }
                        entry!!.definitions.take(6).forEachIndexed { index, definition ->
                            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                definition.partOfSpeech.takeIf(String::isNotBlank)?.let {
                                    Text(it.uppercase(), color = Opuscule, style = MaterialTheme.typography.labelMedium)
                                }
                                Text("${index + 1}. ${definition.definition}", color = Ink, style = MaterialTheme.typography.bodyLarge)
                                definition.example.takeIf(String::isNotBlank)?.let {
                                    Text("« $it »", color = Ink.copy(alpha = .78f), style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                        HorizontalDivider(color = Divider)
                        Text("Source : ${entry!!.source}", color = Ink.copy(alpha = .65f), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
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
