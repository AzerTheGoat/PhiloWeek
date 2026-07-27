package fr.opuscule.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.Box
import androidx.lifecycle.viewmodel.compose.viewModel
import fr.opuscule.android.ui.AuthScreen
import fr.opuscule.android.ui.OpusculeApp
import fr.opuscule.android.ui.OpusculeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OpusculeTheme {
                Surface(Modifier.fillMaxSize()) {
                    val state: AppState = viewModel()
                    Root(state)
                }
            }
        }
    }
}

@Composable
private fun Root(state: AppState) {
    when {
        state.restoring -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        state.user == null -> AuthScreen(state)
        else -> OpusculeApp(state)
    }
}
