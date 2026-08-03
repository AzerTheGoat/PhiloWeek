package fr.opuscule.android.ui

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import fr.opuscule.android.AppState
import fr.opuscule.android.data.ElocutionAudio
import fr.opuscule.android.data.ElocutionCourse
import fr.opuscule.android.data.ElocutionEvaluation
import fr.opuscule.android.data.ElocutionExercise
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

@Composable
fun ElocutionScreen(state: AppState, back: () -> Unit) {
    val token = state.token ?: return
    var courses by remember { mutableStateOf<List<ElocutionCourse>>(emptyList()) }
    var selected by remember { mutableStateOf<ElocutionCourse?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        loading = true; error = null
        runCatching { state.api.elocutionCourses(token) }
            .onSuccess { rows -> courses = rows; selected = selected?.let { old -> rows.find { it.id == old.id } } }
            .onFailure { error = it.message }
        loading = false
    }
    LaunchedEffect(token) { load() }
    if (selected != null) {
        ElocutionCourseDetail(state, selected!!, back = { selected = null }, reload = ::load)
        return
    }
    Column(Modifier.fillMaxSize().background(Canvas)) {
        ElocutionHeader("Élocution", "Cours et résultats", back)
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Opuscule) }
            error != null -> ErrorPane(error.orEmpty(), ::load)
            courses.isEmpty() -> EmptyPane("Aucun cours", "Importez un cours JSON depuis la version web. Il apparaîtra ici automatiquement.", Icons.Rounded.GraphicEq)
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text("Vos cours importés sur le web", color = Muted) }
                items(courses, key = ElocutionCourse::id) { course ->
                    val audios = course.chapters.flatMap { it.exercises }.flatMap { it.audios }
                    val scores = audios.mapNotNull { it.evaluation?.globalScore }
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(ReadingPaper).clickable { selected = course }.padding(18.dp)) {
                        Text(course.title, style = MaterialTheme.typography.titleLarge)
                        course.description?.let { Text(it, color = Muted, modifier = Modifier.padding(top = 6.dp), maxLines = 2) }
                        Text("${course.chapters.size} chapitre(s) · ${audios.size} audio(s)${if (scores.isNotEmpty()) " · %.1f/10".format(scores.average()) else ""}", color = Opuscule, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 12.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ElocutionCourseDetail(state: AppState, course: ElocutionCourse, back: () -> Unit, reload: () -> Unit) {
    var expanded by remember(course.id) { mutableStateOf<String?>(course.chapters.firstOrNull()?.id) }
    Column(Modifier.fillMaxSize().background(Canvas)) {
        ElocutionHeader(course.title, "Lecture et enregistrement", back)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            course.description?.let { item { Text(it, color = Muted, style = MaterialTheme.typography.bodyLarge) } }
            items(course.chapters, key = { it.id }) { chapter ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(ReadingPaper)) {
                    Row(Modifier.fillMaxWidth().clickable { expanded = if (expanded == chapter.id) null else chapter.id }.padding(17.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { Text("Jour ${chapter.number}", color = Opuscule, style = MaterialTheme.typography.labelMedium); Text(chapter.title, style = MaterialTheme.typography.titleLarge) }
                        Icon(if (expanded == chapter.id) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown, null, tint = Muted)
                    }
                    if (expanded == chapter.id) {
                        chapter.description?.let { Text(it, color = Muted, modifier = Modifier.padding(horizontal = 17.dp, vertical = 6.dp)) }
                        chapter.exercises.forEach { exercise -> HorizontalDivider(color = Divider); MobileElocutionExercise(state, exercise, reload) }
                    }
                }
            }
        }
    }
}

@Composable
private fun MobileElocutionExercise(state: AppState, exercise: ElocutionExercise, reload: () -> Unit) {
    val token = state.token ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var recorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var output by remember { mutableStateOf<File?>(null) }
    var recording by remember { mutableStateOf(false) }
    var seconds by remember { mutableIntStateOf(0) }
    var selectedEvaluation by remember { mutableStateOf<ElocutionEvaluation?>(null) }
    var pendingStart by remember { mutableStateOf(false) }

    fun startRecording() {
        val file = File(context.cacheDir, "elocution-${System.currentTimeMillis()}.m4a")
        runCatching {
            @Suppress("DEPRECATION")
            MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128_000)
                setAudioSamplingRate(44_100)
                setOutputFile(file.absolutePath)
                prepare(); start()
                recorder = this
            }
            output = file; seconds = 0; recording = true
        }.onFailure { state.notify("Impossible de démarrer le microphone.", "error") }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted && pendingStart) startRecording() else if (!granted) state.notify("Autorisez le microphone pour enregistrer.", "warning")
        pendingStart = false
    }
    fun requestStart() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startRecording()
        else { pendingStart = true; permission.launch(Manifest.permission.RECORD_AUDIO) }
    }
    fun stopRecording() {
        val file = output
        runCatching { recorder?.stop() }
        recorder?.release(); recorder = null; recording = false
        if (file != null && file.exists()) scope.launch {
            runCatching { state.api.uploadElocutionAudio(token, exercise.id, file, seconds.coerceAtLeast(1)) }
                .onSuccess { state.notify("Enregistrement synchronisé"); reload() }
                .onFailure(state::handle)
            file.delete()
        }
    }
    LaunchedEffect(recording) { while (recording && isActive) { delay(1_000); seconds++ } }
    DisposableEffect(Unit) { onDispose { runCatching { recorder?.stop() }; recorder?.release(); output?.delete() } }

    Column(Modifier.fillMaxWidth().padding(17.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(exercise.type.replace('_', ' ').uppercase(), color = Opuscule, style = MaterialTheme.typography.labelMedium)
        Text(exercise.instruction, style = MaterialTheme.typography.titleMedium)
        exercise.supportText?.let { Text(it, color = Muted, modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(Surface).padding(12.dp)) }
        if (!recording) PrimaryButton("Enregistrer cet exercice", ::requestStart, Modifier.fillMaxWidth())
        else PrimaryButton("Arrêter · ${seconds}s", ::stopRecording, Modifier.fillMaxWidth())
        exercise.audios.forEach { audio -> MobileAudioResult(audio) { selectedEvaluation = audio.evaluation } }
    }
    selectedEvaluation?.let { EvaluationDialog(it) { selectedEvaluation = null } }
}

@Composable
private fun MobileAudioResult(audio: ElocutionAudio, open: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(Surface)
            .clickable(enabled = audio.evaluation != null, onClick = open).padding(13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.Mic, null, tint = Opuscule, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f).padding(start = 10.dp)) { Text("${audio.durationSeconds / 60}:${String.format("%02d", audio.durationSeconds % 60)} · ${audio.source}"); Text(audio.recordedAt?.take(16)?.replace('T', ' ').orEmpty(), color = Muted, style = MaterialTheme.typography.labelMedium) }
        Text(audio.evaluation?.let { "%.1f/10".format(it.globalScore) } ?: "À analyser sur le web", color = if (audio.evaluation == null) Warning else Success, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun EvaluationDialog(evaluation: ElocutionEvaluation, close: () -> Unit) {
    androidx.compose.material3.AlertDialog(
        onDismissRequest = close,
        title = { Text("Résultat · %.1f/10".format(evaluation.globalScore)) },
        text = { LazyColumn(Modifier.height(430.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Text(evaluation.generalRemarks) }
            evaluation.detailScores.forEach { (name, detail) -> item { Column(Modifier.fillMaxWidth().background(Surface, RoundedCornerShape(12.dp)).padding(12.dp)) { Row { Text(name.replaceFirstChar(Char::uppercase), Modifier.weight(1f), fontWeight = FontWeight.Bold); Text("%.1f/10".format(detail.first), color = Opuscule) }; Text(detail.second, color = Muted, modifier = Modifier.padding(top = 4.dp)) } } }
            if (evaluation.advice.isNotEmpty()) item { Text("Conseils", fontWeight = FontWeight.Bold); evaluation.advice.forEach { Text("• $it", modifier = Modifier.padding(top = 5.dp)) } }
        } },
        confirmButton = { androidx.compose.material3.TextButton(close) { Text("Fermer") } },
        containerColor = Canvas,
        shape = RoundedCornerShape(22.dp),
    )
}

@Composable
private fun ElocutionHeader(title: String, subtitle: String, back: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Surface)) {
        Row(Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(back) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Retour") }
            Column { Text(title, style = MaterialTheme.typography.titleLarge); Text(subtitle, color = Muted, style = MaterialTheme.typography.labelMedium) }
        }
        HorizontalDivider(color = Divider)
    }
}
