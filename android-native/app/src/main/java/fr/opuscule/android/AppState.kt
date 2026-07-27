package fr.opuscule.android

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fr.opuscule.android.data.ApiClient
import fr.opuscule.android.data.ApiException
import fr.opuscule.android.data.SecureTokenStore
import fr.opuscule.android.data.User
import kotlinx.coroutines.launch

class AppState(application: Application) : AndroidViewModel(application) {
    val api = ApiClient()
    private val tokenStore = SecureTokenStore(application)
    private val appearancePreferences =
        application.getSharedPreferences("opuscule_appearance", Application.MODE_PRIVATE)

    var user by mutableStateOf<User?>(null)
        private set
    var restoring by mutableStateOf(true)
        private set
    var authBusy by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var messageTone by mutableStateOf("success")
        private set
    var compactInterface by mutableStateOf(appearancePreferences.getBoolean("compact_interface", true))
        private set
    var themeMode by mutableStateOf(appearancePreferences.getString("theme_mode", "system") ?: "system")
        private set
    var readingFontSize by mutableStateOf(
        appearancePreferences.getFloat("reading_font_size", 17.5f).coerceIn(14f, 25f)
    )
        private set

    var token: String? = null
        private set

    init {
        viewModelScope.launch {
            token = tokenStore.load()
            if (token != null) {
                runCatching { api.me(token!!) }
                    .onSuccess { user = it }
                    .onFailure { clearSession() }
            }
            restoring = false
        }
    }

    fun authenticate(username: String, password: String, register: Boolean) {
        if (authBusy) return
        viewModelScope.launch {
            authBusy = true
            message = null
            runCatching { api.authenticate(username.trim(), password, register) }
                .onSuccess { (nextUser, nextToken) ->
                    token = nextToken
                    user = nextUser
                    tokenStore.save(nextToken)
                }
                .onFailure { message = it.userMessage() }
            authBusy = false
        }
    }

    fun logout() {
        val current = token
        clearSession()
        if (current != null) viewModelScope.launch { runCatching { api.logout(current) } }
    }

    fun notify(value: String?, tone: String = "success") {
        message = value
        if (value != null) messageTone = tone
    }

    fun updateCompactInterface(compact: Boolean) {
        compactInterface = compact
        appearancePreferences.edit().putBoolean("compact_interface", compact).apply()
    }

    fun updateThemeMode(mode: String) {
        themeMode = mode.takeIf { it in setOf("system", "light", "dark") } ?: "system"
        appearancePreferences.edit().putString("theme_mode", themeMode).apply()
    }

    fun updateReadingFontSize(size: Float) {
        readingFontSize = size.coerceIn(14f, 25f)
        appearancePreferences.edit().putFloat("reading_font_size", readingFontSize).apply()
    }

    fun handle(error: Throwable) {
        if (error is ApiException && error.status == 401) clearSession()
        message = error.userMessage()
        messageTone = "error"
    }

    private fun clearSession() {
        token = null
        user = null
        tokenStore.clear()
    }
}

fun Throwable.userMessage(): String = message?.takeIf { it.isNotBlank() } ?: "Une erreur est survenue."
