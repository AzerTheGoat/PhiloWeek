package fr.opuscule.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Article
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MenuBook
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Quiz
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.TipsAndUpdates
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import fr.opuscule.android.AppState
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDateTime

private enum class RootTab(val label: String, val icon: ImageVector) {
    HOME("Accueil", Icons.Rounded.Home),
    FILES("Fichiers", Icons.Rounded.FolderOpen),
    REVIEW("Réviser", Icons.Rounded.Quiz),
    ORGANIZE("Organiser", Icons.Rounded.Checklist),
    ARTICLES("Articles", Icons.AutoMirrored.Rounded.Article),
}

private fun rootTabAccent(@Suppress("UNUSED_PARAMETER") tab: RootTab): Color = Opuscule

private fun rootTabAccentSoft(@Suppress("UNUSED_PARAMETER") tab: RootTab): Color = OpusculeSoft

@Composable
fun AuthScreen(state: AppState) {
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var register by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().background(Canvas).verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 38.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        OpusculeLogo()
        Spacer(Modifier.height(34.dp))
        Text(if (register) "Créer votre espace" else "Bienvenue sur Opuscule", style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(8.dp))
        Text(
            if (register) "Un lieu pour lire, organiser et retenir ce qui compte."
            else "Retrouvez vos notes, vos révisions et vos lectures.",
            style = MaterialTheme.typography.bodyLarge,
            color = Muted,
        )
        Spacer(Modifier.height(30.dp))
        OutlinedTextField(
            username,
            { username = it },
            Modifier.fillMaxWidth(),
            label = { Text("Identifiant") },
            singleLine = true,
            shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            password,
            { password = it },
            Modifier.fillMaxWidth(),
            label = { Text("Mot de passe") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        )
        state.message?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, color = Danger, style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(18.dp))
        PrimaryButton(
            if (state.authBusy) "Connexion…" else if (register) "Créer mon compte" else "Continuer",
            { state.authenticate(username, password, register) },
            Modifier.fillMaxWidth(),
            !state.authBusy && username.isNotBlank() && password.length >= 10,
        )
        TextButton(onClick = { register = !register }, Modifier.align(Alignment.CenterHorizontally)) {
            Text(if (register) "J’ai déjà un compte" else "Créer un compte", color = Ink)
        }
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Lock, null, tint = Muted, modifier = Modifier.size(15.dp))
            Text(" Session protégée par Android Keystore", color = Muted, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun OpusculeApp(state: AppState) {
    var tabName by rememberSaveable { mutableStateOf(RootTab.HOME.name) }
    var fileStack by remember { mutableStateOf<List<String>>(emptyList()) }
    var settingsVisible by remember { mutableStateOf(false) }
    var organizeTarget by remember { mutableStateOf<OrganizationSection?>(null) }
    var chromeHidden by remember { mutableStateOf(false) }
    val tab = RootTab.valueOf(tabName)
    val snackbars = remember { SnackbarHostState() }

    BackHandler(enabled = settingsVisible || fileStack.isNotEmpty() || tab != RootTab.HOME) {
        when {
            settingsVisible -> settingsVisible = false
            fileStack.isNotEmpty() -> fileStack = fileStack.dropLast(1)
            tab != RootTab.HOME -> tabName = RootTab.HOME.name
        }
    }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbars.showSnackbar(it)
            state.notify(null)
        }
    }
    UsageTracker(state)

    Box(Modifier.fillMaxSize().background(Canvas)) {
        Scaffold(
            containerColor = Canvas,
            snackbarHost = {
                SnackbarHost(snackbars) { data ->
                    val color = when (state.messageTone) {
                        "error" -> Danger
                        "warning" -> Warning
                        else -> Success
                    }
                    Snackbar(
                        snackbarData = data,
                        containerColor = color,
                        contentColor = androidx.compose.ui.graphics.Color.White,
                    )
                }
            },
            bottomBar = {
                if (!chromeHidden) {
                Column(Modifier.background(Canvas).navigationBarsPadding()) {
                    HorizontalDivider(color = Divider)
                    NavigationBar(containerColor = Canvas, tonalElevation = 0.dp) {
                        RootTab.entries.forEach { item ->
                            val accent = rootTabAccent(item)
                            val accentSoft = rootTabAccentSoft(item)
                            NavigationBarItem(
                                selected = item == tab,
                                onClick = { tabName = item.name },
                                icon = { Icon(item.icon, null, modifier = Modifier.size(22.dp)) },
                                label = { Text(item.label) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = accent,
                                    selectedTextColor = accent,
                                    indicatorColor = accentSoft,
                                    unselectedIconColor = Muted,
                                    unselectedTextColor = Muted,
                                ),
                            )
                        }
                    }
                }
                }
            },
        ) { padding ->
            AnimatedContent(
                tab,
                modifier = Modifier.fillMaxSize().padding(padding),
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "root-navigation",
            ) { current ->
                when (current) {
                    RootTab.HOME -> HomeScreen(
                        state,
                        goFiles = { tabName = RootTab.FILES.name },
                        goReview = { tabName = RootTab.REVIEW.name },
                        goArticles = { tabName = RootTab.ARTICLES.name },
                        quickCapture = { organizeTarget = it; tabName = RootTab.ORGANIZE.name },
                        openSettings = { settingsVisible = true },
                    )
                    RootTab.FILES -> FilesScreen(state, openOverlay = { fileStack = listOf(it) })
                    RootTab.REVIEW -> ReviewScreen(state, openSource = { fileStack = listOf(it) }, onImmersiveChange = { chromeHidden = it })
                    RootTab.ORGANIZE -> OrganizationScreen(state, organizeTarget, { organizeTarget = null }, onDetailChange = { chromeHidden = it })
                    RootTab.ARTICLES -> ArticlesScreen(state, onDetailChange = { chromeHidden = it })
                }
            }
        }

        AnimatedVisibility(
            fileStack.isNotEmpty(),
            enter = slideInHorizontally { it } + fadeIn(),
            exit = slideOutHorizontally { it } + fadeOut(),
        ) {
            fileStack.lastOrNull()?.let {
                FileViewerScreen(
                    state,
                    it,
                    { fileStack = fileStack.dropLast(1) },
                    { linkedId -> if (fileStack.lastOrNull() != linkedId) fileStack = fileStack + linkedId },
                )
            }
        }
        AnimatedVisibility(
            settingsVisible,
            enter = slideInHorizontally { it } + fadeIn(),
            exit = slideOutHorizontally { it } + fadeOut(),
        ) {
            SettingsScreen(state) { settingsVisible = false }
        }
    }
}

@Composable
private fun UsageTracker(state: AppState) {
    val token = state.token ?: return
    val scope = rememberCoroutineScope()
    LifecycleResumeEffect(token) {
        val job = scope.launch {
            while (isActive) {
                delay(60_000)
                val logicalDay = LocalDateTime.now().minusHours(3).toLocalDate().toString()
                runCatching { state.api.trackUsage(token, logicalDay, 60) }
            }
        }
        onPauseOrDispose { job.cancel() }
    }
}

@Composable
private fun HomeScreen(
    state: AppState,
    goFiles: () -> Unit,
    goReview: () -> Unit,
    goArticles: () -> Unit,
    quickCapture: (OrganizationSection) -> Unit,
    openSettings: () -> Unit,
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            OpusculeLogo(compact = true)
            Text("Opuscule", Modifier.padding(start = 11.dp).weight(1f), style = MaterialTheme.typography.titleLarge)
            IconButton(onClick = openSettings, modifier = Modifier.clip(CircleShape).background(Surface)) {
                Icon(Icons.Rounded.Person, "Réglages", tint = Ink)
            }
        }
        Spacer(Modifier.height(26.dp))
        Text("Bienvenue, ${state.user?.username.orEmpty()}", style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(8.dp))
        Text("Que voulez-vous faire aujourd’hui ?", style = MaterialTheme.typography.bodyLarge, color = Muted)
        Spacer(Modifier.height(34.dp))
        SurfaceGroup {
            ActionRow("Réviser maintenant", "Une série sur toutes vos connaissances", Icons.Rounded.Quiz, goReview, accent = Opuscule, accentSoft = OpusculeSoft)
            HorizontalDivider(color = Divider)
            ActionRow("Ouvrir mes fichiers", "Notes et documents", Icons.Rounded.FolderOpen, goFiles)
            HorizontalDivider(color = Divider)
            ActionRow("Lire les articles", "Les dernières publications", Icons.Rounded.AutoStories, goArticles)
        }
        Spacer(Modifier.height(30.dp))
        SectionLabel("Capture rapide")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            QuickAction("Idée", Icons.Rounded.Lightbulb, Opuscule, OpusculeSoft, Modifier.weight(1f)) { quickCapture(OrganizationSection.IDEAS) }
            QuickAction("Citation", Icons.Rounded.MenuBook, Opuscule, OpusculeSoft, Modifier.weight(1f)) { quickCapture(OrganizationSection.QUOTES) }
        }
        Spacer(Modifier.height(9.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            QuickAction("Fact check", Icons.Rounded.Verified, Opuscule, OpusculeSoft, Modifier.weight(1f)) { quickCapture(OrganizationSection.FACTS) }
            QuickAction("Tâche", Icons.Rounded.Checklist, Opuscule, OpusculeSoft, Modifier.weight(1f)) { quickCapture(OrganizationSection.TODOS) }
        }
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun QuickAction(label: String, icon: ImageVector, accent: Color, accentSoft: Color, modifier: Modifier, onClick: () -> Unit) {
    androidx.compose.material3.Surface(
        onClick = onClick,
        modifier = modifier.height(74.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(17.dp),
        color = accentSoft,
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = accent, modifier = Modifier.size(21.dp))
            Text(label, Modifier.padding(start = 9.dp), style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun SettingsScreen(state: AppState, onBack: () -> Unit) {
    var appearanceVisible by remember { mutableStateOf(false) }
    DetailScaffold("Réglages", onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(58.dp).clip(CircleShape).background(Ink), contentAlignment = Alignment.Center) {
                    Text(state.user?.username?.take(1)?.uppercase().orEmpty(), color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.headlineMedium)
                }
                Column(Modifier.padding(start = 14.dp)) {
                    Text(state.user?.username.orEmpty(), style = MaterialTheme.typography.titleLarge)
                    Text("Compte Opuscule", color = Muted)
                }
            }
            SurfaceGroup {
                ActionRow(
                    "Apparence",
                    if (state.compactInterface) "Interface compacte · palette sobre" else "Interface confortable · palette sobre",
                    Icons.Rounded.TipsAndUpdates,
                    onClick = { appearanceVisible = true },
                )
                HorizontalDivider(color = Divider)
                ActionRow("Version", "1.1.1 · Android natif", Icons.Rounded.Description, onClick = {}, trailing = {})
            }
            SurfaceGroup {
                ActionRow("Se déconnecter", "Retirer la session de cet appareil", Icons.AutoMirrored.Rounded.Logout, state::logout, destructive = true, trailing = {})
            }
        }
    }
    if (appearanceVisible) {
        AlertDialog(
            onDismissRequest = { appearanceVisible = false },
            title = { Text("Apparence") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Une seule couleur d’accent, avec du rouge et du vert réservés aux états.", color = Muted)
                    Row(
                        Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
                            .clickable { state.updateCompactInterface(true) }.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(state.compactInterface, { state.updateCompactInterface(true) })
                        Text("Compact · plus d’espace utile")
                    }
                    Row(
                        Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
                            .clickable { state.updateCompactInterface(false) }.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(!state.compactInterface, { state.updateCompactInterface(false) })
                        Text("Confort · éléments plus espacés")
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { appearanceVisible = false }) { Text("Terminé", color = Opuscule) }
            },
            containerColor = Canvas,
        )
    }
}
