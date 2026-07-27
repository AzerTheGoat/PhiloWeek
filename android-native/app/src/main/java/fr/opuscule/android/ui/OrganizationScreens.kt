package fr.opuscule.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Verified
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.opuscule.android.AppState
import fr.opuscule.android.data.Agenda
import fr.opuscule.android.data.FactCheck
import fr.opuscule.android.data.Idea
import fr.opuscule.android.data.Quote
import fr.opuscule.android.data.Todo
import fr.opuscule.android.data.UsageSummary
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.max

enum class OrganizationSection {
    IDEAS, QUOTES, FACTS, TODOS, AGENDA, LIFE, USAGE
}

@Composable
fun OrganizationScreen(
    state: AppState,
    requested: OrganizationSection?,
    consumed: () -> Unit,
    onDetailChange: (Boolean) -> Unit = {},
) {
    var section by remember { mutableStateOf<OrganizationSection?>(null) }
    LaunchedEffect(requested) {
        if (requested != null) {
            section = requested
            consumed()
        }
    }
    DisposableEffect(section) {
        onDetailChange(section != null)
        onDispose { if (section != null) onDetailChange(false) }
    }
    if (section != null) {
        when (section!!) {
            OrganizationSection.IDEAS -> IdeasScreen(state) { section = null }
            OrganizationSection.QUOTES -> QuotesScreen(state) { section = null }
            OrganizationSection.FACTS -> FactsScreen(state) { section = null }
            OrganizationSection.TODOS -> TodosScreen(state) { section = null }
            OrganizationSection.AGENDA -> AgendaScreen(state) { section = null }
            OrganizationSection.LIFE -> LifeScreen(state) { section = null }
            OrganizationSection.USAGE -> UsageScreen(state) { section = null }
        }
        return
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
        ScreenHeader(
            "Organiser",
            modifier = Modifier.padding(horizontal = 0.dp),
            subtitle = "Capturez, planifiez, prenez du recul",
        )
        SectionLabel("Capturer")
        ActionRow("Idées", "Pensées rapides à reprendre", Icons.Rounded.Lightbulb, { section = OrganizationSection.IDEAS }, accent = Amber, accentSoft = AmberSoft)
        HorizontalDivider(color = Divider)
        ActionRow("Citations", "Textes, auteurs et sources", Icons.AutoMirrored.Rounded.MenuBook, { section = OrganizationSection.QUOTES }, accent = KnowledgeBlue, accentSoft = KnowledgeBlueSoft)
        HorizontalDivider(color = Divider)
        ActionRow("Fact checks", "Affirmations à vérifier", Icons.Rounded.Verified, { section = OrganizationSection.FACTS }, accent = Sage, accentSoft = SageSoft)
        Spacer(Modifier.height(22.dp))
        SectionLabel("Planifier")
        ActionRow("Tâches", "Échéances et suivi", Icons.Rounded.Checklist, { section = OrganizationSection.TODOS }, accent = Coral, accentSoft = CoralSoft)
        HorizontalDivider(color = Divider)
        ActionRow("Agenda & habitudes", "Calendrier et régularité", Icons.Rounded.CalendarMonth, { section = OrganizationSection.AGENDA }, accent = Opuscule, accentSoft = OpusculeSoft)
        Spacer(Modifier.height(22.dp))
        SectionLabel("Prendre du recul")
        ActionRow("Vie en semaines", "Visualiser le temps vécu", Icons.Rounded.FavoriteBorder, { section = OrganizationSection.LIFE }, accent = Coral, accentSoft = CoralSoft)
        HorizontalDivider(color = Divider)
        ActionRow("Statistiques", "Temps passé dans Opuscule", Icons.Rounded.BarChart, { section = OrganizationSection.USAGE }, accent = KnowledgeBlue, accentSoft = KnowledgeBlueSoft)
        Spacer(Modifier.height(26.dp))
    }
}

@Composable
private fun IdeasScreen(state: AppState, back: () -> Unit) {
    val token = state.token ?: return
    var rows by remember { mutableStateOf<List<Idea>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<Idea?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        loading = true
        runCatching { state.api.ideas(token) }.onSuccess { rows = it }.onFailure(state::handle)
        loading = false
    }
    LaunchedEffect(Unit) { load() }
    CollectionScaffold("Idées", back, { adding = true }) {
        when {
            loading -> LoadingPane()
            rows.isEmpty() -> EmptyPane("Aucune idée", "Capturez une pensée avant qu’elle disparaisse.", Icons.Rounded.Lightbulb, "Ajouter") { adding = true }
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { IdeaGardenHeader(rows.size) }
                itemsIndexed(rows, key = { _, idea -> idea.id }) { index, row ->
                    IdeaCard(row, index, delete = { deleting = row })
                }
            }
        }
    }
    if (adding) SimpleCreateDialog("Nouvelle idée", "Votre idée", { adding = false }) { content, _, _ ->
        scope.launch { runCatching { state.api.createIdea(token, content) }.onSuccess { adding = false; state.notify("Idée semée"); load() }.onFailure(state::handle) }
    }
    deleting?.let { idea ->
        ConfirmDeleteDialog("Supprimer cette idée ?", "Cette graine sera retirée définitivement.", { deleting = null }) {
            scope.launch { runCatching { state.api.deleteIdea(token, idea.id) }.onSuccess { deleting = null; state.notify("Idée supprimée"); load() }.onFailure(state::handle) }
        }
    }
}

@Composable
private fun QuotesScreen(state: AppState, back: () -> Unit) {
    val token = state.token ?: return
    var rows by remember { mutableStateOf<List<Quote>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<Quote?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        loading = true
        runCatching { state.api.quotes(token) }.onSuccess { rows = it }.onFailure(state::handle)
        loading = false
    }
    LaunchedEffect(Unit) { load() }
    CollectionScaffold("Citations", back, { adding = true }) {
        when {
            loading -> LoadingPane()
            rows.isEmpty() -> EmptyPane("Aucune citation", "Gardez les phrases qui méritent de rester.", Icons.AutoMirrored.Rounded.MenuBook, "Ajouter") { adding = true }
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item { QuoteLibraryHeader(rows.size) }
                itemsIndexed(rows, key = { _, quote -> quote.id }) { index, row ->
                    QuoteCard(row, index, delete = { deleting = row })
                }
            }
        }
    }
    if (adding) SimpleCreateDialog("Nouvelle citation", "Citation", { adding = false }, secondaryLabel = "Auteur", thirdLabel = "Source") { quote, author, source ->
        scope.launch { runCatching { state.api.createQuote(token, quote, author, source) }.onSuccess { adding = false; state.notify("Citation ajoutée"); load() }.onFailure(state::handle) }
    }
    deleting?.let { quote ->
        ConfirmDeleteDialog("Supprimer cette citation ?", "Elle disparaîtra de votre bibliothèque intérieure.", { deleting = null }) {
            scope.launch { runCatching { state.api.deleteQuote(token, quote.id) }.onSuccess { deleting = null; state.notify("Citation supprimée"); load() }.onFailure(state::handle) }
        }
    }
}

@Composable
private fun FactsScreen(state: AppState, back: () -> Unit) {
    val token = state.token ?: return
    var rows by remember { mutableStateOf<List<FactCheck>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<FactCheck?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        loading = true
        runCatching { state.api.factChecks(token) }.onSuccess { rows = it }.onFailure(state::handle)
        loading = false
    }
    LaunchedEffect(Unit) { load() }
    CollectionScaffold("Fact checks", back, { adding = true }) {
        when {
            loading -> LoadingPane()
            rows.isEmpty() -> EmptyPane("Rien à vérifier", "Notez une affirmation sans interrompre votre lecture.", Icons.Rounded.Verified, "Ajouter") { adding = true }
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { FactDashboard(rows) }
                items(rows, key = FactCheck::id) { row ->
                    var menu by remember(row.id) { mutableStateOf(false) }
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(19.dp)).background(factSoftColor(row.status)).padding(16.dp)) {
                        Row(verticalAlignment = Alignment.Top) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                FactStatusChip(row.status)
                                Text(row.claim, style = MaterialTheme.typography.titleLarge)
                                row.notes?.takeIf(String::isNotBlank)?.let { Text(it, color = Muted, style = MaterialTheme.typography.bodyMedium) }
                                row.source?.takeIf(String::isNotBlank)?.let {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Rounded.Verified, null, tint = factColor(row.status), modifier = Modifier.size(15.dp))
                                        Text(" Source · $it", color = Muted, style = MaterialTheme.typography.bodyMedium)
                                    }
                                }
                            }
                            Box {
                                IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreHoriz, "Options") }
                                DropdownMenu(menu, { menu = false }, containerColor = Canvas) {
                                    listOf("to_check", "true", "false", "partial").forEach { status ->
                                        DropdownMenuItem({ Text(factLabel(status)) }, onClick = {
                                            menu = false
                                            scope.launch { runCatching { state.api.updateFactStatus(token, row.id, status) }.onSuccess { state.notify("Verdict mis à jour"); load() }.onFailure(state::handle) }
                                        })
                                    }
                                    DropdownMenuItem({ Text("Supprimer", color = Danger) }, onClick = {
                                        menu = false
                                        deleting = row
                                    }, leadingIcon = { Icon(Icons.Rounded.Delete, null, tint = Danger) })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if (adding) SimpleCreateDialog("Nouveau fact check", "Affirmation à vérifier", { adding = false }, secondaryLabel = "Source", thirdLabel = "Notes") { claim, source, notes ->
        scope.launch { runCatching { state.api.createFact(token, claim, source, notes) }.onSuccess { adding = false; state.notify("Enquête ajoutée"); load() }.onFailure(state::handle) }
    }
    deleting?.let { fact ->
        ConfirmDeleteDialog("Supprimer cette enquête ?", "L’affirmation, sa source et son verdict seront supprimés.", { deleting = null }) {
            scope.launch { runCatching { state.api.deleteFact(token, fact.id) }.onSuccess { deleting = null; state.notify("Fact check supprimé"); load() }.onFailure(state::handle) }
        }
    }
}

@Composable
private fun TodosScreen(state: AppState, back: () -> Unit) {
    val token = state.token ?: return
    var rows by remember { mutableStateOf<List<Todo>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<Todo?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        loading = true
        runCatching { state.api.todos(token) }.onSuccess { rows = it }.onFailure(state::handle)
        loading = false
    }
    LaunchedEffect(Unit) { load() }
    CollectionScaffold("Tâches", back, { adding = true }) {
        when {
            loading -> LoadingPane()
            rows.isEmpty() -> EmptyPane("Aucune tâche", "Vous avez l’esprit libre.", Icons.Rounded.CheckCircle, "Ajouter") { adding = true }
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                item { TodoDashboard(rows) }
                todoGroups(rows).forEach { (label, group) ->
                    if (group.isNotEmpty()) {
                        item { SectionLabel(label) }
                        items(group, key = Todo::id) { row ->
                            TodoActionCard(
                                row,
                                toggle = { scope.launch { runCatching { state.api.toggleTodo(token, row) }.onSuccess { state.notify(if (row.status == "done") "Tâche rouverte" else "Tâche accomplie"); load() }.onFailure(state::handle) } },
                                delete = { deleting = row },
                            )
                        }
                    }
                }
            }
        }
    }
    if (adding) SimpleCreateDialog(
        "Nouvelle tâche",
        "Que faut-il faire ?",
        { adding = false },
        secondaryLabel = "Échéance AAAA-MM-JJ",
        thirdLabel = "Notes",
        secondaryDefault = LocalDate.now().toString(),
    ) { title, date, notes ->
        scope.launch { runCatching { state.api.createTodo(token, title, date, notes) }.onSuccess { adding = false; state.notify("Tâche planifiée"); load() }.onFailure(state::handle) }
    }
    deleting?.let { todo ->
        ConfirmDeleteDialog("Supprimer cette tâche ?", "Cette action ne pourra pas être annulée.", { deleting = null }) {
            scope.launch { runCatching { state.api.deleteTodo(token, todo.id) }.onSuccess { deleting = null; state.notify("Tâche supprimée"); load() }.onFailure(state::handle) }
        }
    }
}

@Composable
private fun AgendaScreen(state: AppState, back: () -> Unit) {
    val token = state.token ?: return
    var data by remember { mutableStateOf<Agenda?>(null) }
    var todos by remember { mutableStateOf<List<Todo>>(emptyList()) }
    var selected by remember { mutableStateOf(LocalDate.now()) }
    var month by remember { mutableStateOf(YearMonth.now()) }
    var addingPractice by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        runCatching {
            data = state.api.agenda(token, 90)
            todos = state.api.todos(token)
        }.onFailure(state::handle)
    }
    LaunchedEffect(Unit) { load() }
    DetailScaffold("Agenda", back) { padding ->
        if (data == null) Box(Modifier.fillMaxSize().padding(padding)) { LoadingPane() }
        else Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp)) {
            MonthHeader(month, { month = month.minusMonths(1) }, { month = month.plusMonths(1) })
            MonthGrid(month, selected, data!!, todos) { selected = it }
            Spacer(Modifier.height(24.dp))
            Text(prettyDate(selected.toString()), style = MaterialTheme.typography.headlineMedium)
            val dayTodos = todos.filter { it.dueAt == selected.toString() }
            if (dayTodos.isNotEmpty()) {
                SectionLabel("Tâches")
                dayTodos.forEach { todo ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (todo.status == "done") Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked, null, tint = if (todo.status == "done") Success else Muted)
                        Text(todo.title, Modifier.padding(start = 9.dp), style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
            SectionLabel("Habitudes")
            data!!.practices.filter { it.active }.forEach { practice ->
                val done = data!!.checks.any { it.practiceId == practice.id && it.entryDate == selected.toString() && it.done }
                Row(
                    Modifier.fillMaxWidth().clickable {
                        scope.launch {
                            runCatching { state.api.checkPractice(token, practice.id, selected.toString(), !done) }
                                .onSuccess { load() }.onFailure(state::handle)
                        }
                    }.padding(vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(28.dp).clip(RoundedCornerShape(9.dp)).background(if (done) Ink else Surface), contentAlignment = Alignment.Center) {
                        if (done) Icon(Icons.Rounded.Check, null, tint = Color.White, modifier = Modifier.size(17.dp))
                    }
                    Text(practice.title, Modifier.padding(start = 11.dp), style = MaterialTheme.typography.titleMedium)
                }
            }
            TextButton(onClick = { addingPractice = true }) { Icon(Icons.Rounded.Add, null); Text(" Ajouter une habitude") }
            Spacer(Modifier.height(16.dp))
            SectionLabel("Rythme · 42 derniers jours")
            HabitRhythm(data!!)
            Spacer(Modifier.height(30.dp))
        }
    }
    if (addingPractice) SimpleCreateDialog("Nouvelle habitude", "Nom de l’habitude", { addingPractice = false }) { title, _, _ ->
        scope.launch { runCatching { state.api.createPractice(token, title) }.onSuccess { addingPractice = false; load() }.onFailure(state::handle) }
    }
}

@Composable
private fun LifeScreen(state: AppState, back: () -> Unit) {
    val token = state.token ?: return
    var agenda by remember { mutableStateOf<Agenda?>(null) }
    var birth by remember { mutableStateOf("") }
    var yearsText by remember { mutableStateOf("85") }
    var unitWeeks by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        runCatching { state.api.agenda(token) }.onSuccess {
            agenda = it
            birth = it.profile.birthDate.orEmpty()
            yearsText = it.profile.lifeExpectancyYears.toString()
        }.onFailure(state::handle)
    }
    LaunchedEffect(Unit) { load() }
    DetailScaffold("Vie en perspective", back) { padding ->
        if (agenda == null) Box(Modifier.fillMaxSize().padding(padding)) { LoadingPane() }
        else Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Chaque point représente ${if (unitWeeks) "une semaine" else "un mois"}.", color = Muted, style = MaterialTheme.typography.bodyLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallToggle("Mois", !unitWeeks) { unitWeeks = false }
                SmallToggle("Semaines", unitWeeks) { unitWeeks = true }
            }
            OutlinedTextField(birth, { birth = it }, Modifier.fillMaxWidth(), label = { Text("Date de naissance AAAA-MM-JJ") }, singleLine = true)
            OutlinedTextField(yearsText, { value -> yearsText = value.filter(Char::isDigit).take(3) }, Modifier.fillMaxWidth(), label = { Text("Horizon en années") }, singleLine = true)
            val born = runCatching { LocalDate.parse(birth) }.getOrNull()
            val years = yearsText.toIntOrNull()?.takeIf { it in 1..130 }
            val profileValid = born != null && !born.isAfter(LocalDate.now()) && years != null
            PrimaryButton("Enregistrer", {
                scope.launch { runCatching { state.api.updateLifeProfile(token, birth, years!!) }.onSuccess { state.notify("Profil enregistré"); load() }.onFailure(state::handle) }
            }, Modifier.fillMaxWidth(), profileValid)
            if (born != null && born.isAfter(LocalDate.now())) {
                Text("La date de naissance ne peut pas être dans le futur.", color = Danger, style = MaterialTheme.typography.bodyMedium)
            }
            if (profileValid) {
                val today = LocalDate.now()
                val horizon = born!!.plusYears(years!!.toLong())
                val end = minOf(today, horizon)
                val elapsed = if (unitWeeks) ChronoUnit.WEEKS.between(born, end).toInt() else ChronoUnit.MONTHS.between(born, end).toInt()
                val total = if (unitWeeks) ChronoUnit.WEEKS.between(born, horizon).toInt() else ChronoUnit.MONTHS.between(born, horizon).toInt()
                val remaining = (total - elapsed).coerceAtLeast(0)
                val percent = if (total == 0) 0 else ((elapsed.toDouble() / total) * 100).toInt().coerceIn(0, 100)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    LifeMetric("Vécu", elapsed.toString(), KnowledgeBlue, KnowledgeBlueSoft, Modifier.weight(1f))
                    LifeMetric("Restant", remaining.toString(), Sage, SageSoft, Modifier.weight(1f))
                    LifeMetric("Parcours", "$percent %", Amber, AmberSoft, Modifier.weight(1f))
                }
                Text("Horizon : ${prettyDate(horizon.toString())}", color = Muted, style = MaterialTheme.typography.bodyMedium)
                LifeDots(total, elapsed, unitWeeks)
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}

@Composable
private fun UsageScreen(state: AppState, back: () -> Unit) {
    val token = state.token ?: return
    var data by remember { mutableStateOf<UsageSummary?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        error = null
        runCatching { state.api.usage(token) }.onSuccess { data = it }.onFailure { error = it.message }
    }
    LaunchedEffect(Unit) { load() }
    DetailScaffold("Statistiques", back, action = {
        IconButton(onClick = { load() }) { Icon(Icons.Rounded.Refresh, "Actualiser") }
    }) { padding ->
        when {
            data != null -> Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Text("Temps dans Opuscule", style = MaterialTheme.typography.headlineMedium)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Metric("Aujourd’hui", formatDuration(data!!.todaySeconds), Modifier.weight(1f))
                    Metric("Cette semaine", formatDuration(data!!.weekSeconds), Modifier.weight(1f))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Metric("Ce mois", formatDuration(data!!.monthSeconds), Modifier.weight(1f))
                    Metric("Total", formatDuration(data!!.totalSeconds), Modifier.weight(1f))
                }
                SectionLabel("30 derniers jours")
                UsageChart(data!!.history.take(30).reversed())
                Text("Moyenne quotidienne ce mois : ${formatDuration(data!!.averageDailyMonthSeconds)}", color = Muted)
                Spacer(Modifier.height(20.dp))
            }
            error != null -> Box(Modifier.fillMaxSize().padding(padding)) { ErrorPane(error.orEmpty(), ::load) }
            else -> Box(Modifier.fillMaxSize().padding(padding)) { LoadingPane() }
        }
    }
}

@Composable
private fun CollectionScaffold(title: String, back: () -> Unit, add: () -> Unit, content: @Composable () -> Unit) {
    BackHandler(onBack = back)
    DetailScaffold(title, back, action = {
        IconButton(onClick = add, modifier = Modifier.clip(CircleShape).background(Surface)) { Icon(Icons.Rounded.Add, "Ajouter") }
    }) { padding -> Box(Modifier.fillMaxSize().padding(padding)) { content() } }
}

@Composable
private fun CollectionItem(title: String, subtitle: String, delete: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (subtitle.isNotBlank()) Text(subtitle, color = Muted, style = MaterialTheme.typography.bodyMedium)
        }
        IconButton(onClick = delete) { Icon(Icons.Rounded.Delete, "Supprimer", tint = Muted) }
    }
    HorizontalDivider(color = Divider)
}

@Composable
private fun IdeaGardenHeader(count: Int) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(AmberSoft).padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(48.dp).clip(RoundedCornerShape(15.dp)).background(Amber).padding(11.dp)) {
            Icon(Icons.Rounded.Lightbulb, null, tint = Color.White)
        }
        Column(Modifier.padding(start = 14.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("Jardin d’idées", color = Amber, style = MaterialTheme.typography.titleLarge)
            Text("$count graine${if (count > 1) "s" else ""} à reprendre, relier ou développer.", color = Muted, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun IdeaCard(idea: Idea, index: Int, delete: () -> Unit) {
    val accents = listOf(Amber, Opuscule, KnowledgeBlue, Sage, Coral)
    val softs = listOf(AmberSoft, OpusculeSoft, KnowledgeBlueSoft, SageSoft, CoralSoft)
    val accent = accents[index % accents.size]
    val soft = softs[index % softs.size]
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(soft).padding(17.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("GRAINE ${index + 1}", color = accent, style = MaterialTheme.typography.labelMedium, letterSpacing = .8.sp)
            Spacer(Modifier.weight(1f))
            Text(formatDate(idea.createdAt), color = Muted, style = MaterialTheme.typography.labelMedium)
            IconButton(onClick = delete, modifier = Modifier.size(38.dp)) { Icon(Icons.Rounded.Delete, "Supprimer", tint = Muted, modifier = Modifier.size(18.dp)) }
        }
        Text(idea.content, style = MaterialTheme.typography.titleLarge)
        val tags = idea.tags.split(',', ' ', '[', ']', '"').map(String::trim).filter(String::isNotBlank).take(4)
        if (tags.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            tags.forEach { tag ->
                Text("#$tag", color = accent, style = MaterialTheme.typography.labelMedium, modifier = Modifier.clip(CircleShape).background(ReadingPaper).padding(horizontal = 9.dp, vertical = 5.dp))
            }
        }
        Text("À quelle autre idée pourrait-elle se relier ?", color = Muted, style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic)
    }
}

@Composable
private fun QuoteLibraryHeader(count: Int) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text("Bibliothèque intérieure", color = KnowledgeBlue, style = MaterialTheme.typography.headlineMedium)
        Text("$count passage${if (count > 1) "s" else ""} conservé${if (count > 1) "s" else ""} pour penser, écrire ou revenir à l’essentiel.", color = Muted)
    }
}

@Composable
private fun QuoteCard(quote: Quote, index: Int, delete: () -> Unit) {
    val accents = listOf(KnowledgeBlue, Opuscule, Sage, Amber)
    val accent = accents[index % accents.size]
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(ReadingPaper)) {
        Box(Modifier.width(5.dp).height(180.dp).background(accent))
        Column(Modifier.weight(1f).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row {
                Text("“", color = accent, fontFamily = FontFamily.Serif, fontSize = 42.sp, lineHeight = 34.sp)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = delete, modifier = Modifier.size(36.dp)) { Icon(Icons.Rounded.Delete, "Supprimer", tint = Muted, modifier = Modifier.size(17.dp)) }
            }
            Text(quote.quote, fontFamily = FontFamily.Serif, fontSize = 20.sp, lineHeight = 29.sp, color = Ink)
            quote.author?.takeIf(String::isNotBlank)?.let { Text("— $it", color = accent, style = MaterialTheme.typography.titleMedium) }
            quote.source?.takeIf(String::isNotBlank)?.let { Text(it, color = Muted, style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic) }
            quote.notes?.takeIf(String::isNotBlank)?.let {
                Text(it, color = Muted, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Surface).padding(10.dp))
            }
        }
    }
}

@Composable
private fun FactDashboard(rows: List<FactCheck>) {
    val pending = rows.count { it.status == "to_check" }
    val decided = rows.size - pending
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        DashboardMetric("À enquêter", pending.toString(), Warning, AmberSoft, Modifier.weight(1f))
        DashboardMetric("Verdicts", decided.toString(), Sage, SageSoft, Modifier.weight(1f))
    }
}

@Composable
private fun FactStatusChip(status: String) {
    Text(
        factLabel(status).uppercase(),
        color = factColor(status),
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.clip(CircleShape).background(ReadingPaper.copy(alpha = .78f)).padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

@Composable
private fun factSoftColor(status: String) = when (status) {
    "true" -> SuccessSoft
    "false" -> DangerSoft
    "partial" -> OpusculeSoft
    else -> AmberSoft
}

@Composable
private fun TodoDashboard(rows: List<Todo>) {
    val today = LocalDate.now().toString()
    val open = rows.count { it.status != "done" }
    val urgent = rows.count { it.status != "done" && it.dueAt.isNotBlank() && it.dueAt <= today }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        DashboardMetric("En mouvement", open.toString(), Coral, CoralSoft, Modifier.weight(1f))
        DashboardMetric("À traiter", urgent.toString(), Danger, DangerSoft, Modifier.weight(1f))
    }
}

private fun todoGroups(rows: List<Todo>): List<Pair<String, List<Todo>>> {
    val today = LocalDate.now().toString()
    val open = rows.filter { it.status != "done" }
    return listOf(
        "En retard" to open.filter { it.dueAt.isNotBlank() && it.dueAt < today },
        "Aujourd’hui" to open.filter { it.dueAt == today },
        "À venir" to open.filter { it.dueAt.isBlank() || it.dueAt > today },
        "Accomplies" to rows.filter { it.status == "done" },
    )
}

@Composable
private fun TodoActionCard(todo: Todo, toggle: () -> Unit, delete: () -> Unit) {
    val today = LocalDate.now().toString()
    val done = todo.status == "done"
    val late = !done && todo.dueAt.isNotBlank() && todo.dueAt < today
    val dueToday = !done && todo.dueAt == today
    val accent = when { done -> Success; late -> Danger; dueToday -> Amber; else -> Coral }
    val soft = when { done -> SuccessSoft; late -> DangerSoft; dueToday -> AmberSoft; else -> ReadingPaper }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(soft).clickable(onClick = toggle).padding(start = 15.dp, top = 13.dp, bottom = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(if (done) accent else Color.Transparent), contentAlignment = Alignment.Center) {
            Icon(if (done) Icons.Rounded.Check else Icons.Rounded.RadioButtonUnchecked, null, tint = if (done) Color.White else accent)
        }
        Column(Modifier.padding(start = 12.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(todo.title, style = MaterialTheme.typography.titleMedium, color = if (done) Muted else Ink, textDecoration = if (done) TextDecoration.LineThrough else null)
            todo.notes?.takeIf(String::isNotBlank)?.let { Text(it, color = Muted, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            if (todo.dueAt.isNotBlank()) Text(
                when { late -> "En retard · ${prettyDate(todo.dueAt)}"; dueToday -> "À faire aujourd’hui"; else -> prettyDate(todo.dueAt) },
                color = accent,
                style = MaterialTheme.typography.labelMedium,
            )
        }
        IconButton(onClick = delete) { Icon(Icons.Rounded.Delete, "Supprimer", tint = Muted, modifier = Modifier.size(18.dp)) }
    }
}

@Composable
private fun DashboardMetric(label: String, value: String, accent: Color, soft: Color, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(18.dp)).background(soft).padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(value, color = accent, style = MaterialTheme.typography.headlineMedium)
        Text(label, color = Muted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ConfirmDeleteDialog(title: String, message: String, dismiss: () -> Unit, confirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text(title) },
        text = { Text(message, color = Muted) },
        confirmButton = { TextButton(onClick = confirm) { Text("Supprimer", color = Danger) } },
        dismissButton = { TextButton(onClick = dismiss) { Text("Annuler", color = Muted) } },
        shape = RoundedCornerShape(22.dp),
        containerColor = Canvas,
    )
}

@Composable
private fun SimpleCreateDialog(
    title: String,
    primaryLabel: String,
    dismiss: () -> Unit,
    secondaryLabel: String? = null,
    thirdLabel: String? = null,
    secondaryDefault: String = "",
    save: (String, String, String) -> Unit,
) {
    var primary by remember { mutableStateOf("") }
    var secondary by remember { mutableStateOf(secondaryDefault) }
    var third by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                OutlinedTextField(primary, { primary = it }, label = { Text(primaryLabel) }, minLines = if (secondaryLabel == null) 4 else 2)
                secondaryLabel?.let { OutlinedTextField(secondary, { secondary = it }, label = { Text(it) }) }
                thirdLabel?.let { OutlinedTextField(third, { third = it }, label = { Text(it) }, minLines = 2) }
            }
        },
        confirmButton = { TextButton(onClick = { save(primary.trim(), secondary.trim(), third.trim()) }, enabled = primary.isNotBlank()) { Text("Enregistrer", color = Opuscule) } },
        dismissButton = { TextButton(onClick = dismiss) { Text("Annuler", color = Muted) } },
        shape = RoundedCornerShape(22.dp),
        containerColor = Canvas,
    )
}

@Composable
private fun MonthHeader(month: YearMonth, previous: () -> Unit, next: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(month.month.getDisplayName(TextStyle.FULL, Locale.FRENCH).replaceFirstChar(Char::uppercase) + " ${month.year}", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
        TextButton(onClick = previous) { Text("‹", style = MaterialTheme.typography.headlineMedium, color = Ink) }
        TextButton(onClick = next) { Text("›", style = MaterialTheme.typography.headlineMedium, color = Ink) }
    }
}

@Composable
private fun MonthGrid(month: YearMonth, selected: LocalDate, agenda: Agenda, todos: List<Todo>, pick: (LocalDate) -> Unit) {
    val first = month.atDay(1)
    val offset = first.dayOfWeek.value - 1
    val cells = (0 until 42).map { first.minusDays(offset.toLong()).plusDays(it.toLong()) }
    Row(Modifier.fillMaxWidth()) {
        listOf("L", "M", "M", "J", "V", "S", "D").forEach { Text(it, Modifier.weight(1f), textAlign = TextAlign.Center, color = Muted, style = MaterialTheme.typography.labelMedium) }
    }
    repeat(6) { week ->
        Row(Modifier.fillMaxWidth()) {
            cells.subList(week * 7, week * 7 + 7).forEach { day ->
                val hasTodo = todos.any { it.dueAt == day.toString() && it.status != "done" }
                val active = day == selected
                Column(
                    Modifier.weight(1f).aspectRatio(1f).clip(CircleShape).background(if (active) Ink else Color.Transparent)
                        .clickable { pick(day) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(day.dayOfMonth.toString(), color = when { active -> Color.White; day.month != month.month -> Muted.copy(alpha = .45f); else -> Ink }, style = MaterialTheme.typography.bodyMedium)
                    if (hasTodo) Box(Modifier.size(4.dp).clip(CircleShape).background(if (active) Color.White else Opuscule))
                }
            }
        }
    }
}

@Composable
private fun HabitRhythm(agenda: Agenda) {
    val days = (41 downTo 0).map { LocalDate.parse(agenda.today).minusDays(it.toLong()) }
    val active = agenda.practices.count { it.active }.coerceAtLeast(1)
    LazyVerticalGrid(GridCells.Fixed(14), modifier = Modifier.fillMaxWidth().height(76.dp), userScrollEnabled = false) {
        items(days) { day ->
            val done = agenda.checks.count { it.entryDate == day.toString() && it.done }
            val ratio = done.toFloat() / active
            Box(Modifier.padding(2.dp).aspectRatio(1f).clip(RoundedCornerShape(3.dp)).background(
                when {
                    ratio >= 1f -> Ink
                    ratio >= .5f -> Opuscule
                    ratio > 0f -> OpusculeSoft
                    else -> Surface
                }
            ))
        }
    }
}

@Composable
private fun LifeDots(total: Int, elapsed: Int, weeks: Boolean) {
    if (total <= 0) return
    val currentColor = Amber
    val futureColor = SurfacePressed
    val earlyColor = KnowledgeBlue
    val middleColor = Opuscule
    val lateColor = Sage
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val columns = if (weeks) 32 else 24
        val cell = (maxWidth / columns).coerceAtMost(if (weeks) 11.dp else 13.dp)
        val rows = (total + columns - 1) / columns
        Canvas(Modifier.width(cell * columns).height(cell * rows)) {
            val cellPx = size.width / columns
            val radius = cellPx * .29f
            repeat(total) { index ->
                val x = (index % columns) * cellPx + cellPx / 2
                val y = (index / columns) * cellPx + cellPx / 2
                val color = when {
                    index == elapsed.coerceAtMost(total - 1) -> currentColor
                    index >= elapsed -> futureColor
                    index < total / 3 -> earlyColor
                    index < total * 2 / 3 -> middleColor
                    else -> lateColor
                }
                drawCircle(color, radius, androidx.compose.ui.geometry.Offset(x, y))
            }
        }
    }
}

@Composable
private fun LifeMetric(label: String, value: String, accent: Color, soft: Color, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(soft).padding(13.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(value, color = accent, style = MaterialTheme.typography.titleLarge)
        Text(label, color = Muted, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(18.dp)).background(Surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(value, style = MaterialTheme.typography.titleLarge)
        Text(label, color = Muted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun UsageChart(days: List<fr.opuscule.android.data.UsageDay>) {
    val maxValue = max(1, days.maxOfOrNull { it.seconds } ?: 1)
    val accent = Opuscule
    val ink = Ink
    Canvas(Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(18.dp)).background(Surface).padding(12.dp)) {
        if (days.isEmpty()) return@Canvas
        val step = size.width / days.size
        days.forEachIndexed { index, day ->
            val height = size.height * (day.seconds.toFloat() / maxValue)
            drawLine(
                color = if (index == days.lastIndex) accent else ink.copy(alpha = .72f),
                start = androidx.compose.ui.geometry.Offset(step * index + step / 2, size.height),
                end = androidx.compose.ui.geometry.Offset(step * index + step / 2, size.height - height),
                strokeWidth = (step * .52f).coerceAtLeast(3f),
                cap = StrokeCap.Round,
            )
        }
    }
}

@Composable
private fun SmallToggle(label: String, active: Boolean, click: () -> Unit) {
    Text(
        label,
        color = if (active) Color.White else Ink,
        style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.clip(CircleShape).background(if (active) Ink else Surface).clickable(onClick = click).padding(horizontal = 16.dp, vertical = 9.dp),
    )
}

private fun factLabel(status: String) = when (status) {
    "true" -> "Vrai"
    "false" -> "Faux"
    "partial" -> "Partiel"
    else -> "À vérifier"
}

@Composable
private fun factColor(status: String) = when (status) {
    "true" -> Success
    "false" -> Danger
    "partial" -> Opuscule
    else -> Warning
}

private fun formatDate(value: String?): String =
    value?.take(10)?.let(::prettyDate).orEmpty()

private fun prettyDate(value: String): String = runCatching {
    LocalDate.parse(value).format(DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.FRENCH))
}.getOrDefault(value)

private fun formatDuration(seconds: Int): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    return when {
        hours > 0 -> "${hours}h ${minutes.toString().padStart(2, '0')}"
        minutes > 0 -> "${minutes} min"
        else -> "${seconds} s"
    }
}
