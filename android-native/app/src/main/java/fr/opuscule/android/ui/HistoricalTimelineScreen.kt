package fr.opuscule.android.ui

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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.HistoryEdu
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import fr.opuscule.android.AppState
import fr.opuscule.android.data.HistoricalEvent
import kotlinx.coroutines.launch

@Composable
fun HistoricalTimelineScreen(state: AppState, back: () -> Unit) {
    val token = state.token ?: return
    var events by remember { mutableStateOf<List<HistoricalEvent>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<HistoricalEvent?>(null) }
    var editing by remember { mutableStateOf<HistoricalEvent?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<HistoricalEvent?>(null) }
    val scope = rememberCoroutineScope()

    fun load() = scope.launch {
        loading = true
        error = null
        runCatching { state.api.historicalEvents(token) }
            .onSuccess { events = it }
            .onFailure { error = it.message }
        loading = false
    }
    LaunchedEffect(token) { load() }
    BackHandler {
        when {
            creating || editing != null -> { creating = false; editing = null }
            selected != null -> selected = null
            else -> back()
        }
    }

    if (creating || editing != null) {
        HistoricalEventEditor(
            event = editing,
            close = { creating = false; editing = null },
            save = { title, start, end, description, eventCategory ->
                scope.launch {
                    runCatching {
                        editing?.let {
                            state.api.updateHistoricalEvent(token, it.id, title, start, end, description, eventCategory)
                        } ?: state.api.createHistoricalEvent(token, title, start, end, description, eventCategory)
                    }.onSuccess { saved ->
                        events = (events.filterNot { it.id == saved.id } + saved).sortedWith(historicalComparator)
                        selected = saved
                        creating = false
                        editing = null
                        state.notify("Repère historique enregistré")
                    }.onFailure(state::handle)
                }
            },
        )
        return
    }

    selected?.let { event ->
        HistoricalEventDetail(
            event,
            back = { selected = null },
            edit = { editing = event },
            delete = { deleting = event },
        )
        deleting?.let { target ->
            DeleteHistoricalDialog(target, { deleting = null }) {
                deleting = null
                scope.launch {
                    runCatching { state.api.deleteHistoricalEvent(token, target.id) }
                        .onSuccess {
                            events = events.filterNot { it.id == target.id }
                            selected = null
                            state.notify("Repère historique supprimé")
                        }.onFailure(state::handle)
                }
            }
        }
        return
    }

    Column(Modifier.fillMaxSize().background(Canvas)) {
        TimelineHeader(back = back, add = { creating = true })
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
            placeholder = { Text("Rechercher un événement") },
            leadingIcon = { Icon(Icons.Rounded.Search, null) },
            trailingIcon = if (query.isNotEmpty()) ({ IconButton({ query = "" }) { Icon(Icons.Rounded.Close, "Effacer") } }) else null,
            singleLine = true,
            shape = RoundedCornerShape(15.dp),
        )
        val categories = events.mapNotNull { it.category?.trim()?.takeIf(String::isNotEmpty) }.distinct().sorted()
        if (categories.isNotEmpty()) {
            LazyRow(
                Modifier.fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item { TimelineFilter("Tout", category == null) { category = null } }
                items(categories) { label -> TimelineFilter(label, category == label) { category = label } }
            }
            Spacer(Modifier.height(8.dp))
        }
        val visible = events.filter { event ->
            (category == null || event.category == category) &&
                (query.isBlank() || listOf(event.title, event.description.orEmpty(), event.category.orEmpty())
                    .any { it.contains(query, ignoreCase = true) })
        }
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Opuscule) }
            error != null -> ErrorPane(error.orEmpty(), ::load)
            events.isEmpty() -> EmptyPane("Votre frise est vide", "Ajoutez votre premier repère historique.", Icons.Rounded.HistoryEdu, "Ajouter un repère") { creating = true }
            visible.isEmpty() -> EmptyPane("Aucun résultat", "Essayez un autre mot ou une autre catégorie.", Icons.Rounded.Search)
            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 12.dp),
            ) {
                items(visible, key = HistoricalEvent::id) { event ->
                    TimelineEventRow(event) { selected = event }
                }
            }
        }
    }
}

private val historicalComparator = compareBy<HistoricalEvent> { it.startYear ?: Int.MAX_VALUE }
    .thenBy { it.startMonth ?: 0 }.thenBy { it.startDay ?: 0 }

@Composable
private fun TimelineHeader(back: () -> Unit, add: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Surface).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(back) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Retour") }
            Column(Modifier.weight(1f)) {
                Text("Frise historique", style = MaterialTheme.typography.titleLarge)
                Text("Repères, périodes et contexte", color = Muted, style = MaterialTheme.typography.labelMedium)
            }
            IconButton(add, Modifier.clip(CircleShape).background(OpusculeSoft)) { Icon(Icons.Rounded.Add, "Ajouter", tint = Opuscule) }
        }
        HorizontalDivider(color = Divider)
    }
}

@Composable
private fun TimelineFilter(label: String, selected: Boolean, select: () -> Unit) {
    Text(
        label,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(if (selected) Opuscule else Surface)
            .clickable(onClick = select).padding(horizontal = 14.dp, vertical = 9.dp),
        color = if (selected) MaterialTheme.colorScheme.onPrimary else Muted,
        style = MaterialTheme.typography.labelLarge,
    )
}

@Composable
private fun TimelineEventRow(event: HistoricalEvent, open: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = open)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(13.dp).clip(CircleShape).background(Opuscule))
            Box(Modifier.width(2.dp).height(112.dp).background(Divider))
        }
        Column(Modifier.weight(1f).padding(start = 14.dp, bottom = 16.dp)) {
            Text(historicalPeriod(event), color = Opuscule, style = MaterialTheme.typography.labelLarge)
            Text(event.title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 4.dp))
            event.category?.let { Text(it.uppercase(), color = Muted, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 5.dp)) }
            event.description?.let { Text(it, color = Muted, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 7.dp)) }
        }
    }
}

@Composable
private fun HistoricalEventDetail(event: HistoricalEvent, back: () -> Unit, edit: () -> Unit, delete: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Canvas)) {
        Row(Modifier.fillMaxWidth().background(Surface).statusBarsPadding().height(60.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(back) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Retour") }
            Text("Repère historique", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            if (event.canEdit) {
                IconButton(edit) { Icon(Icons.Rounded.Edit, "Modifier") }
                IconButton(delete) { Icon(Icons.Rounded.Delete, "Supprimer", tint = Danger) }
            }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            item {
                Text(historicalPeriod(event), color = Opuscule, style = MaterialTheme.typography.titleMedium)
                Text(event.title, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 8.dp))
                event.category?.let { Text(it.uppercase(), color = Muted, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp)) }
            }
            event.image?.let { image -> item { AsyncImage(image, event.title, Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(20.dp)).background(Surface)) } }
            event.description?.let { description -> item { Text(description, style = MaterialTheme.typography.bodyLarge) } }
        }
    }
}

@Composable
private fun HistoricalEventEditor(
    event: HistoricalEvent?,
    close: () -> Unit,
    save: (String, String, String, String, String) -> Unit,
) {
    var title by remember(event?.id) { mutableStateOf(event?.title.orEmpty()) }
    var start by remember(event?.id) { mutableStateOf(event?.startLabel.orEmpty()) }
    var end by remember(event?.id) { mutableStateOf(event?.endLabel.orEmpty()) }
    var description by remember(event?.id) { mutableStateOf(event?.description.orEmpty()) }
    var category by remember(event?.id) { mutableStateOf(event?.category.orEmpty()) }
    val validDate = Regex("^-?\\d{1,6}(-\\d{1,2})?(-\\d{1,2})?$")
    val valid = title.isNotBlank() && validDate.matches(start.trim()) && (end.isBlank() || validDate.matches(end.trim()))
    Column(Modifier.fillMaxSize().background(Canvas)) {
        Row(Modifier.fillMaxWidth().background(Surface).statusBarsPadding().height(60.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(close) { Icon(Icons.Rounded.Close, "Fermer") }
            Text(if (event == null) "Nouveau repère" else "Modifier le repère", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            TextButton(onClick = { save(title.trim(), start.trim(), end.trim(), description.trim(), category.trim()) }, enabled = valid) { Text("Enregistrer") }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("Titre") }, singleLine = true) }
            item { OutlinedTextField(start, { start = it }, Modifier.fillMaxWidth(), label = { Text("Début") }, supportingText = { Text("Année, AAAA-MM ou AAAA-MM-JJ · années négatives acceptées") }, singleLine = true) }
            item { OutlinedTextField(end, { end = it }, Modifier.fillMaxWidth(), label = { Text("Fin (facultative)") }, singleLine = true) }
            item { OutlinedTextField(category, { category = it }, Modifier.fillMaxWidth(), label = { Text("Catégorie") }, singleLine = true) }
            item { OutlinedTextField(description, { description = it }, Modifier.fillMaxWidth(), label = { Text("Contexte et description") }, minLines = 6) }
        }
    }
}

@Composable
private fun DeleteHistoricalDialog(event: HistoricalEvent, dismiss: () -> Unit, confirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Supprimer ce repère ?") },
        text = { Text("« ${event.title} » sera retiré définitivement de la frise.") },
        confirmButton = { TextButton(confirm) { Text("Supprimer", color = Danger) } },
        dismissButton = { TextButton(dismiss) { Text("Annuler", color = Muted) } },
        shape = RoundedCornerShape(22.dp),
        containerColor = Canvas,
    )
}

private fun historicalPeriod(event: HistoricalEvent): String {
    val start = event.startLabel ?: event.startYear?.toString() ?: "Date inconnue"
    val end = event.endLabel?.takeIf(String::isNotBlank)
    return if (end == null || end == start) start else "$start — $end"
}
