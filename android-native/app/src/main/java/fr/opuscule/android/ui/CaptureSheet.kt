package fr.opuscule.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Translate
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import fr.opuscule.android.AppState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate

private enum class CaptureKind(val label: String, val icon: ImageVector) {
    IDEA("Idée", Icons.Rounded.Lightbulb),
    DEFINITION("Définition", Icons.Rounded.Translate),
    QUOTE("Citation", Icons.AutoMirrored.Rounded.MenuBook),
    FACT("Vérifier", Icons.Rounded.Verified),
    TODO("Tâche", Icons.Rounded.Checklist),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickCaptureSheet(state: AppState, dismiss: () -> Unit) {
    val token = state.token ?: return
    var kind by remember { mutableStateOf(CaptureKind.IDEA) }
    var main by remember { mutableStateOf("") }
    var secondary by remember { mutableStateOf("") }
    var extra by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(kind) {
        main = ""
        secondary = if (kind == CaptureKind.TODO) LocalDate.now().toString() else ""
        extra = ""
        delay(180)
        focusRequester.requestFocus()
    }

    ModalBottomSheet(
        onDismissRequest = dismiss,
        containerColor = ReadingPaper,
        dragHandle = {
            Spacer(
                Modifier.padding(top = 10.dp, bottom = 4.dp).size(width = 42.dp, height = 5.dp)
                    .background(Divider, RoundedCornerShape(50)),
            )
        },
    ) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Capturer", style = MaterialTheme.typography.headlineMedium)
            Text("Gardez l’élan. Vous pourrez organiser plus tard.", color = Muted)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CaptureKind.entries.chunked(3).forEach { rowItems ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        rowItems.forEach { item ->
                            Row(
                                Modifier.weight(1f).background(
                                    if (kind == item) OpusculeSoft else Surface,
                                    RoundedCornerShape(13.dp),
                                ).clickable { kind = item }.padding(horizontal = 8.dp, vertical = 11.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(item.icon, null, tint = if (kind == item) Opuscule else Muted, modifier = Modifier.size(17.dp))
                                Text(
                                    item.label,
                                    Modifier.padding(start = 5.dp),
                                    color = if (kind == item) Opuscule else Muted,
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                )
                            }
                        }
                        repeat(3 - rowItems.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
            OpusculeField(
                value = main,
                onValueChange = { main = it },
                placeholder = when (kind) {
                    CaptureKind.IDEA -> "Quelle idée voulez-vous garder ?"
                    CaptureKind.DEFINITION -> "Quel terme voulez-vous retenir ?"
                    CaptureKind.QUOTE -> "Collez ou écrivez la citation…"
                    CaptureKind.FACT -> "Quelle affirmation faut-il vérifier ?"
                    CaptureKind.TODO -> "Que faut-il faire ?"
                },
                modifier = Modifier.focusRequester(focusRequester),
                minLines = if (kind == CaptureKind.DEFINITION) 1 else 4,
            )
            when (kind) {
                CaptureKind.DEFINITION -> {
                    OpusculeField(secondary, { secondary = it }, "Définition claire", minLines = 3)
                    OpusculeField(extra, { extra = it }, "Exemple ou nuance", minLines = 2)
                }
                CaptureKind.QUOTE -> {
                    OpusculeField(secondary, { secondary = it }, "Auteur, si connu")
                    OpusculeField(extra, { extra = it }, "Source")
                }
                CaptureKind.FACT -> {
                    OpusculeField(secondary, { secondary = it }, "Source éventuelle")
                    OpusculeField(extra, { extra = it }, "Premières notes")
                }
                CaptureKind.TODO -> {
                    OpusculeField(secondary, { secondary = it.filter { char -> char.isDigit() || char == '-' }.take(10) }, "Échéance AAAA-MM-JJ")
                    OpusculeField(extra, { extra = it }, "Notes")
                }
                CaptureKind.IDEA -> Unit
            }
            PrimaryButton(
                if (saving) "Enregistrement…" else "Enregistrer",
                onClick = {
                    scope.launch {
                        saving = true
                        runCatching {
                            when (kind) {
                                CaptureKind.IDEA -> state.api.createIdea(token, main.trim())
                                CaptureKind.DEFINITION -> state.api.addQuickDefinition(token, main.trim(), secondary.trim(), extra.trim())
                                CaptureKind.QUOTE -> state.api.createQuote(token, main.trim(), secondary.trim(), extra.trim())
                                CaptureKind.FACT -> state.api.createFact(token, main.trim(), secondary.trim(), extra.trim())
                                CaptureKind.TODO -> state.api.createTodo(token, main.trim(), secondary.trim(), extra.trim())
                            }
                        }.onSuccess {
                            state.notify(
                                when (kind) {
                                    CaptureKind.IDEA -> "Idée capturée"
                                    CaptureKind.DEFINITION -> "Définition ajoutée aux révisions"
                                    CaptureKind.QUOTE -> "Citation enregistrée"
                                    CaptureKind.FACT -> "Enquête ouverte"
                                    CaptureKind.TODO -> "Tâche ajoutée"
                                },
                            )
                            dismiss()
                        }.onFailure(state::handle)
                        saving = false
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = main.isNotBlank() && !saving &&
                    (kind != CaptureKind.DEFINITION || secondary.isNotBlank()) &&
                    (kind != CaptureKind.TODO || runCatching { LocalDate.parse(secondary) }.isSuccess),
            )
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
fun OpusculeField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    minLines: Int = 1,
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth().background(Surface, RoundedCornerShape(16.dp)).padding(16.dp),
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Ink),
        cursorBrush = SolidColor(Opuscule),
        minLines = minLines,
        keyboardOptions = KeyboardOptions(imeAction = if (minLines > 1) ImeAction.Default else ImeAction.Next),
        decorationBox = { inner ->
            if (value.isEmpty()) Text(placeholder, color = Muted, style = MaterialTheme.typography.bodyLarge)
            inner()
        },
    )
}
