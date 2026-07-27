package fr.opuscule.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Quiz
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Source
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import fr.opuscule.android.AppState
import fr.opuscule.android.data.FileNode
import fr.opuscule.android.data.ReviewQuestion
import kotlinx.coroutines.launch

@Composable
fun ReviewScreen(state: AppState, openSource: (String) -> Unit, onImmersiveChange: (Boolean) -> Unit = {}) {
    val token = state.token ?: return
    var session by remember { mutableStateOf<List<ReviewQuestion>>(emptyList()) }
    var index by remember { mutableIntStateOf(0) }
    var revealed by remember { mutableStateOf(false) }
    var known by remember { mutableIntStateOf(0) }
    var missed by remember { mutableStateOf<List<ReviewQuestion>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var selector by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<ReviewQuestion?>(null) }
    var deleting by remember { mutableStateOf<ReviewQuestion?>(null) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val current = session.getOrNull(index)
    val immersive = session.isNotEmpty() || selector
    DisposableEffect(immersive) {
        onImmersiveChange(immersive)
        onDispose { if (immersive) onImmersiveChange(false) }
    }

    fun start(ids: List<String>? = null, kinds: Set<String> = setOf("questionnaire", "definition", "actor")) = scope.launch {
        loading = true
        runCatching { state.api.review(token, ids, 20) }
            .onSuccess { rows ->
                val filtered = rows.filter { kinds.contains(it.kind) }.take(12)
                if (filtered.isEmpty()) state.notify("Aucune carte disponible pour cette sélection.")
                else {
                    session = filtered
                    index = 0
                    revealed = false
                    known = 0
                    missed = emptyList()
                    selector = false
                }
            }
            .onFailure(state::handle)
        loading = false
    }

    fun grade(value: Boolean) {
        current ?: return
        scope.launch {
            runCatching { state.api.saveReview(token, current, value) }
                .onSuccess {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    if (value) known++ else missed = missed + current
                    index++
                    revealed = false
                }
                .onFailure(state::handle)
        }
    }

    when {
        selector -> ReviewScopeSelector(state, { selector = false }) { ids, kinds -> start(ids, kinds) }
        session.isEmpty() -> ReviewLanding(state, loading, { start() }, { selector = true })
        current == null -> ReviewSummary(session.size, known, missed, { start() }, {
            session = emptyList()
            index = 0
        })
        else -> ReviewCard(
            current,
            index,
            session.size,
            revealed,
            { revealed = true; haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) },
            { grade(false) },
            { grade(true) },
            {
                current.sourceFileId?.let(openSource)
                    ?: state.notify("Aucune note Markdown liée à cette carte.", "warning")
            },
            { editing = current },
            { if (current.kind == "questionnaire") deleting = current },
            {
                scope.launch {
                    runCatching { state.api.setRequireChange(token, current, true) }
                        .onSuccess {
                            session = session.toMutableList().also { it[index] = current.copy(requireChange = true) }
                            state.notify("Ajouté à « À modifier »")
                        }
                        .onFailure(state::handle)
                }
            },
            {
                session = emptyList()
                index = 0
            },
        )
    }

    editing?.let { question ->
        EditQuestionDialog(
            question,
            { editing = null },
        ) { prompt, answer, explanation ->
            scope.launch {
                runCatching { state.api.editReviewQuestion(token, question, prompt, answer, explanation) }
                    .onSuccess {
                        session = session.toMutableList().also {
                            it[index] = question.copy(prompt = prompt, answer = answer, explanation = explanation)
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
                                session = session.filterIndexed { i, _ -> i != index }
                                revealed = false
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
private fun ReviewLanding(state: AppState, loading: Boolean, startAll: () -> Unit, choose: () -> Unit) {
    val token = state.token ?: return
    var resultCount by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        runCatching { state.api.reviewResults(token) }.onSuccess { resultCount = it.size }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
        ScreenHeader(
            "Réviser",
            modifier = Modifier.padding(horizontal = 0.dp),
            subtitle = "Consolidez ce qui compte",
        )
        Spacer(Modifier.height(20.dp))
        Box(Modifier.size(66.dp).clip(RoundedCornerShape(21.dp)).background(OpusculeSoft), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Quiz, null, tint = Opuscule, modifier = Modifier.size(31.dp))
        }
        Spacer(Modifier.height(22.dp))
        Text("Tout revoir", style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(8.dp))
        Text("Une série équilibrée entre vos questionnaires, vos définitions et les personnes de vos réseaux.", style = MaterialTheme.typography.bodyLarge, color = Muted)
        Spacer(Modifier.height(26.dp))
        PrimaryButton(if (loading) "Préparation…" else "Commencer une série", startAll, Modifier.fillMaxWidth(), !loading)
        Spacer(Modifier.height(10.dp))
        SecondaryButton("Choisir les fichiers et dossiers", choose, Modifier.fillMaxWidth(), !loading)
        Spacer(Modifier.height(30.dp))
        SurfaceGroup {
            Row(Modifier.fillMaxWidth().padding(vertical = 15.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.History, null, tint = Muted)
                Column(Modifier.padding(start = 12.dp)) {
                    Text("$resultCount réponses enregistrées", style = MaterialTheme.typography.titleMedium)
                    Text("Les cartes fragiles reviennent plus souvent.", style = MaterialTheme.typography.bodyMedium, color = Muted)
                }
            }
        }
    }
}

@Composable
private fun ReviewCard(
    question: ReviewQuestion,
    index: Int,
    total: Int,
    revealed: Boolean,
    reveal: () -> Unit,
    unknown: () -> Unit,
    known: () -> Unit,
    source: () -> Unit,
    edit: () -> Unit,
    delete: () -> Unit,
    requireChange: () -> Unit,
    stop: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    val kindAccent = reviewKindAccent(question.kind)
    val kindSoft = reviewKindSoft(question.kind)
    BackHandler(onBack = stop)
    Scaffold(
        containerColor = Canvas,
        topBar = {
            Column(Modifier.background(Surface).statusBarsPadding()) {
                Row(Modifier.fillMaxWidth().height(44.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = stop, modifier = Modifier.size(38.dp)) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Quitter") }
                    Text("${index + 1} sur $total", Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.titleMedium)
                    Box {
                        IconButton(onClick = { menu = true }, modifier = Modifier.size(38.dp)) { Icon(Icons.Rounded.MoreHoriz, "Options") }
                        DropdownMenu(menu, { menu = false }, shape = RoundedCornerShape(16.dp), containerColor = Canvas) {
                            DropdownMenuItem(
                                text = { Text("Voir le fichier source") },
                                leadingIcon = { Icon(Icons.Rounded.Source, null) },
                                onClick = { menu = false; source() },
                            )
                            DropdownMenuItem(
                                text = { Text("Modifier la question") },
                                leadingIcon = { Icon(Icons.Rounded.Edit, null) },
                                onClick = { menu = false; edit() },
                            )
                            DropdownMenuItem(
                                text = { Text(if (question.requireChange) "Déjà marquée à modifier" else "Marquer à modifier") },
                                leadingIcon = { Icon(Icons.Rounded.Tune, null, tint = Warning) },
                                enabled = !question.requireChange,
                                onClick = { menu = false; requireChange() },
                            )
                            if (question.kind == "questionnaire") DropdownMenuItem(
                                text = { Text("Supprimer", color = Danger) },
                                leadingIcon = { Icon(Icons.Rounded.Delete, null, tint = Danger) },
                                onClick = { menu = false; delete() },
                            )
                        }
                    }
                }
                HorizontalDivider(color = Divider)
            }
        },
        bottomBar = {
            Column(Modifier.background(Canvas).padding(horizontal = 16.dp, vertical = 10.dp)) {
                AnimatedContent(
                    revealed,
                    transitionSpec = { fadeIn() + scaleIn(initialScale = .98f, animationSpec = spring()) togetherWith fadeOut() },
                    label = "quiz-actions",
                ) { answerVisible ->
                    if (!answerVisible) PrimaryButton("Afficher la réponse", reveal, Modifier.fillMaxWidth())
                    else Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Button(
                            unknown,
                            Modifier.weight(1f).height(54.dp),
                            shape = RoundedCornerShape(15.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Danger, contentColor = androidx.compose.ui.graphics.Color.White),
                        ) { Text("Je ne connais pas", fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
                        Button(
                            known,
                            Modifier.weight(1f).height(54.dp),
                            shape = RoundedCornerShape(15.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Ink, contentColor = androidx.compose.ui.graphics.Color.White),
                        ) { Text("Je connais", fontSize = 14.sp, fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 18.dp).animateContentSize(),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Card(
                Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = ReadingPaper),
                border = androidx.compose.foundation.BorderStroke(1.dp, Divider),
                elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
            ) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(30.dp).clip(CircleShape).background(kindSoft), contentAlignment = Alignment.Center) {
                            Icon(kindIcon(question.kind), null, tint = kindAccent, modifier = Modifier.size(16.dp))
                        }
                        Column(Modifier.padding(start = 9.dp).weight(1f)) {
                            Text(kindLabel(question.kind), color = kindAccent, style = MaterialTheme.typography.labelLarge)
                            Text(
                                question.questionnaireTitle,
                                color = Ink.copy(alpha = .65f),
                                style = MaterialTheme.typography.labelMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    HorizontalDivider(color = Divider)
                    question.image?.let {
                        AsyncImage(
                            it,
                            question.imageAlt,
                            Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(16.dp)).background(Surface),
                        )
                    }
                    Text(
                        question.prompt,
                        color = Ink,
                        style = if (question.prompt.length > 180) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineMedium,
                    )
                    AnimatedContent(
                        revealed,
                        transitionSpec = { fadeIn() togetherWith fadeOut() },
                        label = "answer",
                    ) { visible ->
                        if (visible) {
                            Column(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(OpusculeSoft).padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(9.dp),
                            ) {
                                Text("RÉPONSE", style = MaterialTheme.typography.labelMedium, color = Opuscule)
                                Text(question.answer.ifBlank { "Aucune réponse renseignée." }, color = Ink, style = MaterialTheme.typography.titleLarge)
                                if (question.explanation.isNotBlank()) {
                                    Text(question.explanation, style = MaterialTheme.typography.bodyLarge, color = Ink.copy(alpha = .78f))
                                }
                            }
                        } else {
                            Text(
                                "Formulez votre réponse mentalement.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Ink.copy(alpha = .62f),
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun ReviewSummary(total: Int, known: Int, missed: List<ReviewQuestion>, restart: () -> Unit, finish: () -> Unit) {
    BackHandler(onBack = finish)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Spacer(Modifier.height(28.dp))
        Box(Modifier.size(68.dp).clip(CircleShape).background(SuccessSoft), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.CheckCircle, null, tint = Success, modifier = Modifier.size(34.dp))
        }
        Text("Série terminée", style = MaterialTheme.typography.displaySmall)
        Text("$known sur $total cartes connues", style = MaterialTheme.typography.titleLarge)
        Text("${missed.size} carte${if (missed.size > 1) "s" else ""} à consolider.", style = MaterialTheme.typography.bodyLarge, color = Muted)
        if (missed.isNotEmpty()) {
            SectionLabel("À revoir")
            SurfaceGroup {
                missed.forEachIndexed { index, question ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(kindIcon(question.kind), null, tint = Muted, modifier = Modifier.size(19.dp))
                        Text(question.prompt, Modifier.padding(start = 10.dp).weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    if (index < missed.lastIndex) HorizontalDivider(color = Divider)
                }
            }
        }
        PrimaryButton("Nouvelle série", restart, Modifier.fillMaxWidth())
        SecondaryButton("Terminer", finish, Modifier.fillMaxWidth())
    }
}

@Composable
private fun ReviewScopeSelector(state: AppState, back: () -> Unit, start: (List<String>, Set<String>) -> Unit) {
    val token = state.token ?: return
    var roots by remember { mutableStateOf<List<FileNode>>(emptyList()) }
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    var kinds by remember { mutableStateOf(setOf("questionnaire", "definition", "actor")) }
    var loading by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        runCatching { state.api.files(token) }.onSuccess { roots = it }.onFailure(state::handle)
        loading = false
    }
    val allRows = remember(roots) { flattenFiles(roots) }
    val selectedFileIds = remember(selected, roots) {
        val chosen = allRows.filter { selected.contains(it.id) }
        val ids = mutableSetOf<String>()
        fun add(node: FileNode) {
            if (!node.isFolder) ids += node.id
            node.children.forEach(::add)
        }
        chosen.forEach(::add)
        ids.toList()
    }
    BackHandler(onBack = back)
    DetailScaffold("Choisir les sources", back) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Types de cartes", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    KindToggle("Quiz", "questionnaire", kinds) { kinds = it }
                    KindToggle("Définitions", "definition", kinds) { kinds = it }
                    KindToggle("Personnes", "actor", kinds) { kinds = it }
                }
            }
            HorizontalDivider(color = Divider)
            if (loading) LoadingPane() else LazyColumn(Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 8.dp)) {
                items(allRows, key = { it.id }) { row ->
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            selected = if (selected.contains(row.id)) selected - row.id else selected + row.id
                        }.padding(start = (row.depth * 15).dp, top = 9.dp, bottom = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            selected.contains(row.id),
                            { checked -> selected = if (checked) selected + row.id else selected - row.id },
                            colors = CheckboxDefaults.colors(checkedColor = Ink),
                        )
                        Icon(if (row.isFolder) Icons.Rounded.Folder else Icons.Rounded.Description, null, tint = Muted, modifier = Modifier.size(20.dp))
                        Text(row.name.removeSuffix(".md").removeSuffix(".json"), Modifier.padding(start = 10.dp).weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            Column(Modifier.fillMaxWidth().background(Canvas).padding(16.dp)) {
                Text("${selectedFileIds.size} fichier(s) dans la sélection", color = Muted, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(9.dp))
                PrimaryButton("Commencer", { start(selectedFileIds, kinds) }, Modifier.fillMaxWidth(), selectedFileIds.isNotEmpty() && kinds.isNotEmpty())
            }
        }
    }
}

@Composable
private fun KindToggle(label: String, key: String, selected: Set<String>, update: (Set<String>) -> Unit) {
    val active = selected.contains(key)
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(if (active) Ink else Surface)
            .clickable { update(if (active) selected - key else selected + key) }.padding(horizontal = 11.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (active) {
            Icon(Icons.Rounded.Check, null, tint = androidx.compose.ui.graphics.Color.White, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(4.dp))
        }
        Text(label, color = if (active) androidx.compose.ui.graphics.Color.White else Ink, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun EditQuestionDialog(question: ReviewQuestion, dismiss: () -> Unit, save: (String, String, String) -> Unit) {
    var prompt by remember { mutableStateOf(question.prompt) }
    var answer by remember { mutableStateOf(question.answer) }
    var explanation by remember { mutableStateOf(question.explanation) }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Modifier") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                if (question.kind != "actor") OutlinedTextField(prompt, { prompt = it }, label = { Text(if (question.kind == "definition") "Terme" else "Question") }, minLines = 2)
                OutlinedTextField(answer, { answer = it }, label = { Text(if (question.kind == "actor") "Identité" else "Réponse") }, minLines = 2)
                OutlinedTextField(explanation, { explanation = it }, label = { Text("Explication") }, minLines = 3)
            }
        },
        confirmButton = { TextButton(onClick = { save(prompt.trim(), answer.trim(), explanation.trim()) }, enabled = answer.isNotBlank()) { Text("Enregistrer", color = Opuscule) } },
        dismissButton = { TextButton(onClick = dismiss) { Text("Annuler", color = Muted) } },
        shape = RoundedCornerShape(22.dp),
        containerColor = Canvas,
    )
}

private fun kindLabel(kind: String) = when (kind) {
    "actor" -> "Personne"
    "definition" -> "Définition"
    else -> "Questionnaire"
}

private fun kindIcon(kind: String) = when (kind) {
    "actor" -> Icons.Rounded.Groups
    "definition" -> Icons.AutoMirrored.Rounded.MenuBook
    else -> Icons.Rounded.Quiz
}

@Composable
private fun reviewKindAccent(kind: String) = when (kind) {
    "actor" -> Sage
    "definition" -> KnowledgeBlue
    else -> Opuscule
}

@Composable
private fun reviewKindSoft(kind: String) = when (kind) {
    "actor" -> SageSoft
    "definition" -> KnowledgeBlueSoft
    else -> OpusculeSoft
}
