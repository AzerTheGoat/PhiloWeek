package fr.opuscule.android.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
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
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Article
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Event
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Quiz
import androidx.compose.material.icons.rounded.Source
import androidx.compose.material.icons.rounded.SwipeVertical
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import fr.opuscule.android.AppState
import fr.opuscule.android.data.Article
import fr.opuscule.android.data.FactCheck
import fr.opuscule.android.data.HistoricalEvent
import fr.opuscule.android.data.Idea
import fr.opuscule.android.data.Quote
import fr.opuscule.android.data.ReviewQuestion
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlin.math.abs

private sealed interface KnowledgeItem {
    val id: String

    data class Recall(val question: ReviewQuestion) : KnowledgeItem {
        override val id = "recall:${question.key}"
    }

    data class Thought(val idea: Idea) : KnowledgeItem {
        override val id = "idea:${idea.id}"
    }

    data class Citation(val quote: Quote) : KnowledgeItem {
        override val id = "quote:${quote.id}"
    }

    data class Investigation(val fact: FactCheck) : KnowledgeItem {
        override val id = "fact:${fact.id}"
    }

    data class Reading(val article: Article) : KnowledgeItem {
        override val id = "article:${article.id}"
    }

    data class HistoricalDate(val event: HistoricalEvent) : KnowledgeItem {
        override val id = "historical:${event.id}"
    }
}

private data class KnowledgeSection(
    val id: String,
    val label: String,
    val items: List<KnowledgeItem>,
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TodayScreen(
    state: AppState,
    openSettings: () -> Unit,
    openReview: () -> Unit,
    openArticles: () -> Unit,
    openSection: (OrganizationSection) -> Unit,
    openSource: (String) -> Unit,
) {
    val token = state.token ?: return
    var sections by remember { mutableStateOf<List<KnowledgeSection>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<ReviewQuestion?>(null) }
    var deleting by remember { mutableStateOf<ReviewQuestion?>(null) }
    var completed by remember { mutableIntStateOf(0) }
    val sectionCursors = remember { mutableStateMapOf<String, Int>() }
    val transitionDirections = remember { mutableStateMapOf<String, Int>() }
    val revealed = remember { mutableStateMapOf<String, Boolean>() }
    val rated = remember { mutableStateMapOf<String, Boolean>() }
    val scope = rememberCoroutineScope()

    suspend fun loadFeed() {
        loading = true
        error = null
        runCatching {
            coroutineScope {
                val quiz = async {
                    runCatching { state.api.review(token, limit = 50, reviewKinds = listOf("questionnaire")) }
                        .getOrDefault(emptyList())
                }
                val definitions = async {
                    runCatching { state.api.review(token, limit = 50, reviewKinds = listOf("definition")) }
                        .getOrDefault(emptyList())
                }
                val actors = async {
                    runCatching { state.api.review(token, limit = 30, reviewKinds = listOf("actor")) }
                        .getOrDefault(emptyList())
                }
                val history = async { runCatching { state.api.historicalEvents(token) }.getOrDefault(emptyList()) }
                val ideas = async { runCatching { state.api.ideas(token) }.getOrDefault(emptyList()) }
                val quotes = async { runCatching { state.api.quotes(token) }.getOrDefault(emptyList()) }
                val facts = async { runCatching { state.api.factChecks(token) }.getOrDefault(emptyList()) }
                val articles = async { runCatching { state.api.articles(token) }.getOrDefault(emptyList()) }
                awaitAll(quiz, definitions, actors, history, ideas, quotes, facts, articles)
                buildKnowledgeSections(
                    quiz.await() + definitions.await() + actors.await(),
                    history.await(),
                    ideas.await(),
                    quotes.await(),
                    facts.await(),
                    articles.await(),
                )
            }
        }.onSuccess { sections = it }
            .onFailure { error = it.message ?: "Impossible de préparer votre journée." }
        loading = false
    }

    LaunchedEffect(token) { loadFeed() }

    Column(Modifier.fillMaxSize().background(Canvas)) {
        TodayHeader(state, completed, openSettings)
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    CircularProgressIndicator(color = Opuscule, strokeWidth = 3.dp)
                    Text("Opuscule prépare ce qui mérite votre attention.", color = Muted)
                }
            }
            error != null -> Box(Modifier.fillMaxSize()) {
                ErrorPane(error.orEmpty(), { scope.launch { loadFeed() } })
            }
            sections.isEmpty() -> EmptyPane(
                "Votre journée est prête",
                "Ajoutez des notes, des idées ou des questionnaires pour alimenter ce flux.",
                Icons.Rounded.SwipeVertical,
                "Ouvrir Réviser",
                openReview,
            )
            else -> {
                val pagerState = rememberPagerState(pageCount = { sections.size })
                val currentSection = sections[pagerState.currentPage.coerceIn(sections.indices)]
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("CATÉGORIE", style = MaterialTheme.typography.labelMedium, color = Muted)
                    Spacer(Modifier.weight(1f))
                    Text(
                        currentSection.label.uppercase(),
                        style = MaterialTheme.typography.labelMedium,
                        color = Opuscule,
                    )
                }
                VerticalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxSize(),
                    beyondViewportPageCount = 1,
                ) { page ->
                    val section = sections[page]
                    val cursor = sectionCursors[section.id] ?: 0
                    val occurrenceKey = "${section.id}:$cursor"
                    KnowledgeSectionPage(
                        section = section,
                        cursor = cursor,
                        direction = transitionDirections[section.id] ?: 1,
                        revealed = revealed[occurrenceKey] == true,
                        rating = rated[occurrenceKey] == true,
                        reveal = { revealed[occurrenceKey] = true },
                        complete = {
                            completed += 1
                            transitionDirections[section.id] = 1
                            sectionCursors[section.id] = cursor + 1
                        },
                        saveRecall = { known ->
                            val item = section.items[cursor % section.items.size]
                            if (rated[occurrenceKey] == true) return@KnowledgeSectionPage
                            rated[occurrenceKey] = true
                            completed += 1
                            transitionDirections[section.id] = if (known) 1 else -1
                            sectionCursors[section.id] = cursor + 1
                            if (item is KnowledgeItem.Recall) {
                                scope.launch {
                                    runCatching { state.api.saveReview(token, item.question, known) }
                                        .onFailure {
                                            rated.remove(occurrenceKey)
                                            completed = (completed - 1).coerceAtLeast(0)
                                            state.handle(it)
                                        }
                                    }
                            }
                        },
                        openReview = openReview,
                        openSource = { question ->
                            question.sourceFileId?.let(openSource)
                                ?: state.notify("Aucune fiche Markdown liée à cette question.", "warning")
                        },
                        editQuestion = { editing = it },
                        requireChange = { question ->
                            scope.launch {
                                runCatching { state.api.setRequireChange(token, question, true) }
                                    .onSuccess {
                                        sections = sections.map { section ->
                                            section.copy(items = section.items.map { item ->
                                                if (item is KnowledgeItem.Recall && item.question.key == question.key) {
                                                    item.copy(question = item.question.copy(requireChange = true))
                                                } else item
                                            })
                                        }
                                        state.notify("Ajouté à « À modifier »")
                                    }
                                    .onFailure(state::handle)
                            }
                        },
                        deleteQuestion = { deleting = it },
                        openArticles = openArticles,
                        openSection = openSection,
                    )
                }
            }
        }
    }

    editing?.let { question ->
        EditQuestionDialog(question, { editing = null }) { prompt, answer, explanation ->
            scope.launch {
                runCatching { state.api.editReviewQuestion(token, question, prompt, answer, explanation) }
                    .onSuccess {
                        sections = sections.map { section ->
                            section.copy(items = section.items.map { item ->
                                if (item is KnowledgeItem.Recall && item.question.key == question.key) {
                                    item.copy(question = item.question.copy(prompt = prompt, answer = answer, explanation = explanation))
                                } else item
                            })
                        }
                        editing = null
                        state.notify("Question modifiée")
                    }
                    .onFailure(state::handle)
            }
        }
    }
    deleting?.let { question ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("Supprimer cette question ?") },
            text = { Text("Elle sera retirée définitivement du fichier ${question.fileName}.") },
            confirmButton = {
                TextButton(onClick = {
                    deleting = null
                    scope.launch {
                        runCatching { state.api.deleteQuestion(token, question) }
                            .onSuccess {
                                sections = sections.mapNotNull { section ->
                                    val remaining = section.items.filterNot {
                                        it is KnowledgeItem.Recall && it.question.key == question.key
                                    }
                                    if (remaining.isEmpty()) null else section.copy(items = remaining)
                                }
                                state.notify("Question supprimée")
                            }
                            .onFailure(state::handle)
                    }
                }) { Text("Supprimer", color = Danger) }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Annuler", color = Muted) } },
            shape = RoundedCornerShape(22.dp),
            containerColor = Canvas,
        )
    }
}

@Composable
private fun TodayHeader(state: AppState, completed: Int, openSettings: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Surface)) {
        Row(
            Modifier.fillMaxWidth().height(58.dp).padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OpusculeLogo(Modifier.size(34.dp), compact = true)
            Column(Modifier.padding(start = 11.dp).weight(1f)) {
                Text("Aujourd’hui", style = MaterialTheme.typography.titleLarge)
                Text(
                    if (completed == 0) "Votre espace pour apprendre" else "$completed élément${if (completed > 1) "s" else ""} travaillé${if (completed > 1) "s" else ""}",
                    style = MaterialTheme.typography.labelMedium,
                    color = Muted,
                )
            }
            IconButton(
                onClick = openSettings,
                modifier = Modifier.size(40.dp).clip(CircleShape).background(SurfacePressed),
            ) {
                Icon(Icons.Rounded.Person, "Réglages", tint = Ink)
            }
        }
        HorizontalDivider(color = Divider.copy(alpha = .65f))
    }
}

@Composable
private fun KnowledgeSectionPage(
    section: KnowledgeSection,
    cursor: Int,
    direction: Int,
    revealed: Boolean,
    rating: Boolean,
    reveal: () -> Unit,
    complete: () -> Unit,
    saveRecall: (Boolean) -> Unit,
    openReview: () -> Unit,
    openSource: (ReviewQuestion) -> Unit,
    editQuestion: (ReviewQuestion) -> Unit,
    requireChange: (ReviewQuestion) -> Unit,
    deleteQuestion: (ReviewQuestion) -> Unit,
    openArticles: () -> Unit,
    openSection: (OrganizationSection) -> Unit,
) {
    AnimatedContent(
        targetState = cursor,
        modifier = Modifier.fillMaxSize(),
        transitionSpec = {
            (
                slideInHorizontally(tween(320)) { width -> if (direction > 0) -width else width } +
                    fadeIn(tween(220))
                ) togetherWith (
                slideOutHorizontally(tween(260)) { width -> if (direction > 0) width else -width } +
                    fadeOut(tween(180))
                )
        },
        label = "knowledge-section-${section.id}",
    ) { targetCursor ->
        val item = section.items[targetCursor % section.items.size]
        KnowledgePage(
            item = item,
            revealed = if (targetCursor == cursor) revealed else false,
            rating = if (targetCursor == cursor) rating else false,
            reveal = if (targetCursor == cursor) reveal else ({ }),
            complete = if (targetCursor == cursor) complete else ({ }),
            saveRecall = if (targetCursor == cursor) saveRecall else ({ _ -> }),
            openReview = openReview,
            openSource = openSource,
            editQuestion = editQuestion,
            requireChange = requireChange,
            deleteQuestion = deleteQuestion,
            openArticles = openArticles,
            openSection = openSection,
        )
    }
}

@Composable
private fun KnowledgePage(
    item: KnowledgeItem,
    revealed: Boolean,
    rating: Boolean,
    reveal: () -> Unit,
    complete: () -> Unit,
    saveRecall: (Boolean) -> Unit,
    openReview: () -> Unit,
    openSource: (ReviewQuestion) -> Unit,
    editQuestion: (ReviewQuestion) -> Unit,
    requireChange: (ReviewQuestion) -> Unit,
    deleteQuestion: (ReviewQuestion) -> Unit,
    openArticles: () -> Unit,
    openSection: (OrganizationSection) -> Unit,
) {
    if (item is KnowledgeItem.Recall) {
        RecallSwipePage(
            item.question,
            revealed,
            rating,
            reveal,
            saveRecall,
            openReview,
            { openSource(item.question) },
            { editQuestion(item.question) },
            { requireChange(item.question) },
            { deleteQuestion(item.question) },
        )
        return
    }
    if (item is KnowledgeItem.HistoricalDate) {
        HistoricalDatePage(item.event, revealed, rating, reveal, saveRecall)
        return
    }

    Box(
        Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(ReadingPaper)
                .padding(horizontal = 22.dp, vertical = 22.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            when (item) {
                is KnowledgeItem.Thought -> {
                    KnowledgeEyebrow("IDÉE À REPRENDRE", Icons.Rounded.Lightbulb)
                    Text(item.idea.content, style = MaterialTheme.typography.headlineMedium, maxLines = 9, overflow = TextOverflow.Ellipsis)
                    Text("Une idée devient utile quand elle rencontre une autre idée, une preuve ou une décision.", color = Muted)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SecondaryButton("Plus tard", complete, Modifier.weight(1f))
                        PrimaryButton("Développer", { openSection(OrganizationSection.IDEAS) }, Modifier.weight(1f))
                    }
                }
                is KnowledgeItem.Citation -> {
                    KnowledgeEyebrow("CITATION À RETROUVER", Icons.AutoMirrored.Rounded.MenuBook)
                    Text(
                        "“${item.quote.quote}”",
                        style = MaterialTheme.typography.headlineMedium,
                        fontFamily = FontFamily.Serif,
                        fontStyle = FontStyle.Italic,
                    )
                    item.quote.author?.takeIf(String::isNotBlank)?.let {
                        Text("— $it", color = Opuscule, fontWeight = FontWeight.SemiBold)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SecondaryButton("Passer", complete, Modifier.weight(1f))
                        PrimaryButton("Contextualiser", { openSection(OrganizationSection.QUOTES) }, Modifier.weight(1f))
                    }
                }
                is KnowledgeItem.Investigation -> {
                    KnowledgeEyebrow("ENQUÊTE OUVERTE", Icons.Rounded.Verified)
                    Text(item.fact.claim, style = MaterialTheme.typography.headlineMedium, maxLines = 9, overflow = TextOverflow.Ellipsis)
                    Text(
                        when (item.fact.status) {
                            "true" -> "Verdict actuel : confirmé"
                            "false" -> "Verdict actuel : réfuté"
                            "partial" -> "Verdict actuel : partiellement vrai"
                            else -> "Cette affirmation attend encore une vérification."
                        },
                        color = Muted,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SecondaryButton("Passer", complete, Modifier.weight(1f))
                        PrimaryButton("Enquêter", { openSection(OrganizationSection.FACTS) }, Modifier.weight(1f))
                    }
                }
                is KnowledgeItem.Reading -> {
                    KnowledgeEyebrow("LECTURE SUGGÉRÉE", Icons.AutoMirrored.Rounded.Article)
                    item.article.coverImage?.let {
                        AsyncImage(
                            model = articleImageModel(it),
                            contentDescription = item.article.title,
                            modifier = Modifier.fillMaxWidth().height(170.dp).clip(RoundedCornerShape(18.dp)).background(Surface),
                        )
                    }
                    Text(item.article.title, style = MaterialTheme.typography.headlineMedium)
                    item.article.excerpt?.let {
                        Text(it, color = Muted, maxLines = 4, overflow = TextOverflow.Ellipsis)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SecondaryButton("Passer", complete, Modifier.weight(1f))
                        PrimaryButton("Lire", openArticles, Modifier.weight(1f))
                    }
                }
                is KnowledgeItem.Recall, is KnowledgeItem.HistoricalDate -> Unit
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.SwipeVertical, null, tint = Muted, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    "Balayez vers le haut pour continuer",
                    color = Muted,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
    }
}

@Composable
private fun RecallSwipePage(
    question: ReviewQuestion,
    revealed: Boolean,
    rating: Boolean,
    reveal: () -> Unit,
    save: (Boolean) -> Unit,
    openReview: () -> Unit,
    openSource: () -> Unit,
    edit: () -> Unit,
    requireChange: () -> Unit,
    delete: () -> Unit,
) {
    var menu by remember(question.key) { mutableStateOf(false) }
    var horizontalDrag by remember(question.key, revealed) { mutableFloatStateOf(0f) }
    val swipeThreshold = with(LocalDensity.current) { 92.dp.toPx() }
    val swipeProgress = (abs(horizontalDrag) / swipeThreshold).coerceIn(0f, 1f)
    val gesture = if (revealed && !rating) {
        Modifier.draggable(
            state = rememberDraggableState { amount ->
                horizontalDrag = (horizontalDrag + amount).coerceIn(-1_200f, 1_200f)
            },
            orientation = Orientation.Horizontal,
            onDragStopped = {
                when {
                    horizontalDrag <= -swipeThreshold -> save(false)
                    horizontalDrag >= swipeThreshold -> save(true)
                }
                horizontalDrag = 0f
            },
        )
    } else Modifier

    Box(
        Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.fillMaxSize().then(gesture).graphicsLayer {
                translationX = horizontalDrag
                rotationZ = horizontalDrag / 80f
                alpha = 1f - swipeProgress * .16f
            }.clip(RoundedCornerShape(28.dp)).background(ReadingPaper)
                .padding(horizontal = 22.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            KnowledgeEyebrow(
                when (question.kind) {
                    "definition" -> "DÉFINITION À RETROUVER"
                    "actor" -> "PERSONNE À RECONNAÎTRE"
                    else -> "RAPPEL ACTIF"
                },
                Icons.Rounded.Quiz,
                onMore = { menu = true },
                menu = {
                    DropdownMenu(
                        expanded = menu,
                        onDismissRequest = { menu = false },
                        shape = RoundedCornerShape(16.dp),
                        containerColor = Canvas,
                    ) {
                        DropdownMenuItem(
                            text = { Text("Voir la fiche liée") },
                            leadingIcon = { Icon(Icons.Rounded.Source, null) },
                            onClick = { menu = false; openSource() },
                        )
                        DropdownMenuItem(
                            text = { Text("Modifier") },
                            leadingIcon = { Icon(Icons.Rounded.Edit, null) },
                            onClick = { menu = false; edit() },
                        )
                        DropdownMenuItem(
                            text = { Text(if (question.requireChange) "Déjà marquée à modifier" else "Marquer à modifier") },
                            leadingIcon = { Icon(Icons.Rounded.Tune, null, tint = Warning) },
                            enabled = !question.requireChange,
                            onClick = { menu = false; requireChange() },
                        )
                        if (question.kind == "questionnaire") {
                            DropdownMenuItem(
                                text = { Text("Supprimer", color = Danger) },
                                leadingIcon = { Icon(Icons.Rounded.Delete, null, tint = Danger) },
                                onClick = { menu = false; delete() },
                            )
                        }
                    }
                },
            )
            Text(
                question.questionnaireTitle.ifBlank { question.fileName },
                color = Muted,
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Column(
                Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(question.prompt, style = MaterialTheme.typography.titleLarge)
                if (revealed) {
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                            .background(OpusculeSoft).padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("RÉPONSE", color = Opuscule, style = MaterialTheme.typography.labelMedium)
                        Text(question.answer, style = MaterialTheme.typography.titleLarge)
                        question.explanation.takeIf(String::isNotBlank)?.let { Text(it, color = Muted) }
                    }
                } else {
                    Text(
                        "Formulez la réponse mentalement avant de la révéler.",
                        color = Muted,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
            if (!revealed) {
                PrimaryButton("Afficher la réponse", reveal, Modifier.fillMaxWidth())
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SecondaryButton("← À revoir", { save(false) }, Modifier.weight(1f), enabled = !rating)
                    PrimaryButton("Je savais →", { save(true) }, Modifier.weight(1f), enabled = !rating)
                }
            }
            Text(
                if (revealed) "Glissez la carte à gauche ou à droite"
                else "La question et la correction restent défilables",
                Modifier.fillMaxWidth(),
                color = Muted,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.labelMedium,
            )
            Text(
                "Ouvrir la session complète",
                modifier = Modifier.fillMaxWidth().clickable(onClick = openReview).padding(vertical = 2.dp),
                textAlign = TextAlign.Center,
                color = Opuscule,
                style = MaterialTheme.typography.labelLarge,
            )
        }
        if (revealed && swipeProgress > .08f) {
            Text(
                if (horizontalDrag < 0) "À REVOIR" else "JE SAVAIS",
                modifier = Modifier.align(if (horizontalDrag < 0) Alignment.TopEnd else Alignment.TopStart)
                    .padding(horizontal = 30.dp, vertical = 34.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (horizontalDrag < 0) Danger else Success)
                    .padding(horizontal = 13.dp, vertical = 8.dp),
                color = Color.White,
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}

@Composable
private fun HistoricalDatePage(
    event: HistoricalEvent,
    revealed: Boolean,
    rating: Boolean,
    reveal: () -> Unit,
    save: (Boolean) -> Unit,
) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(28.dp)).background(ReadingPaper)
            .padding(horizontal = 22.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        KnowledgeEyebrow("DATE À RETROUVER", Icons.Rounded.Event)
        event.category?.takeIf(String::isNotBlank)?.let {
            Text(it.uppercase(), color = Muted, style = MaterialTheme.typography.labelMedium)
        }
        Column(
            Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            event.image?.let {
                AsyncImage(
                    model = articleImageModel(it),
                    contentDescription = event.title,
                    modifier = Modifier.fillMaxWidth().height(170.dp)
                        .clip(RoundedCornerShape(18.dp)).background(Surface),
                )
            }
            Text(event.title, style = MaterialTheme.typography.headlineMedium)
            event.description?.takeIf(String::isNotBlank)?.let {
                Text(it, color = Muted, maxLines = 6, overflow = TextOverflow.Ellipsis)
            }
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Box(Modifier.fillMaxWidth().height(3.dp).clip(CircleShape).background(Divider))
                Box(
                    Modifier.padding(start = 28.dp).size(18.dp).clip(CircleShape)
                        .background(if (revealed) Opuscule else SurfacePressed),
                )
            }
            Text(
                if (revealed) "DATE" else "À quelle date situez-vous cet événement ?",
                color = if (revealed) Opuscule else Ink,
                style = MaterialTheme.typography.labelLarge,
            )
            if (revealed) {
                Text(historicalDateAnswer(event), style = MaterialTheme.typography.displaySmall, color = Opuscule)
            } else {
                Text("Essayez de donner l’année — ou la période — avant de révéler la réponse.", color = Muted)
            }
        }
        if (!revealed) {
            PrimaryButton("Afficher la date", reveal, Modifier.fillMaxWidth())
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SecondaryButton("À revoir", { save(false) }, Modifier.weight(1f), enabled = !rating)
                PrimaryButton("Je savais", { save(true) }, Modifier.weight(1f), enabled = !rating)
            }
        }
    }
}

private fun historicalDateAnswer(event: HistoricalEvent): String {
    fun date(label: String?, year: Int?, month: Int?, day: Int?): String {
        if (!label.isNullOrBlank()) return label
        if (year == null) return "Date inconnue"
        val months = listOf(
            "", "janvier", "février", "mars", "avril", "mai", "juin",
            "juillet", "août", "septembre", "octobre", "novembre", "décembre",
        )
        return when {
            day != null && month != null -> "$day ${months.getOrElse(month) { month.toString() }} $year"
            month != null -> "${months.getOrElse(month) { month.toString() }} $year"
            year < 0 -> "${-year} av. J.-C."
            else -> year.toString()
        }
    }
    val start = date(event.startLabel, event.startYear, event.startMonth, event.startDay)
    val hasEnd = !event.endLabel.isNullOrBlank() || event.endYear != null
    return if (hasEnd) "$start — ${date(event.endLabel, event.endYear, event.endMonth, event.endDay)}" else start
}

@Composable
private fun KnowledgeEyebrow(
    label: String,
    icon: ImageVector,
    onMore: (() -> Unit)? = null,
    menu: @Composable (() -> Unit)? = null,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(OpusculeSoft), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Opuscule, modifier = Modifier.size(20.dp))
        }
        Text(label, Modifier.padding(start = 10.dp).weight(1f), color = Opuscule, style = MaterialTheme.typography.labelMedium)
        if (onMore != null) {
            Box {
                IconButton(onClick = onMore, modifier = Modifier.size(38.dp)) {
                    Icon(Icons.Rounded.MoreHoriz, "Options", tint = Ink)
                }
                menu?.invoke()
            }
        }
    }
}

private fun buildKnowledgeSections(
    reviews: List<ReviewQuestion>,
    history: List<HistoricalEvent>,
    ideas: List<Idea>,
    quotes: List<Quote>,
    facts: List<FactCheck>,
    articles: List<Article>,
): List<KnowledgeSection> = buildList {
    fun addSection(id: String, label: String, items: List<KnowledgeItem>) {
        if (items.isNotEmpty()) add(KnowledgeSection(id, label, items))
    }

    addSection(
        "quiz",
        "Quiz",
        reviews.filter { it.kind == "questionnaire" }.map(KnowledgeItem::Recall),
    )
    addSection(
        "definitions",
        "Définitions",
        reviews.filter { it.kind == "definition" }.map(KnowledgeItem::Recall),
    )
    addSection(
        "actors",
        "Personnes",
        reviews.filter { it.kind == "actor" }.map(KnowledgeItem::Recall),
    )
    addSection(
        "history",
        "Dates historiques",
        history.filter { it.startYear != null || !it.startLabel.isNullOrBlank() }
            .take(30)
            .map(KnowledgeItem::HistoricalDate),
    )
    addSection("ideas", "Idées", ideas.take(12).map(KnowledgeItem::Thought))
    addSection(
        "articles",
        "Articles",
        articles.filter { !it.readByMe }.ifEmpty { articles }.take(12).map(KnowledgeItem::Reading),
    )
    addSection("quotes", "Citations", quotes.take(12).map(KnowledgeItem::Citation))
    addSection(
        "facts",
        "À vérifier",
        facts.filter { it.status == "to_check" || it.status == "partial" }
            .take(12)
            .map(KnowledgeItem::Investigation),
    )
}
