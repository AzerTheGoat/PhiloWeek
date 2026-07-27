package fr.opuscule.android.ui

import android.app.Activity
import android.os.Build
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Canvas = Color(0xFFFCFAF6)
val Surface = Color(0xFFF4F0E9)
val SurfacePressed = Color(0xFFECE6DC)
val ReadingPaper = Color(0xFFFFFEFB)
val Ink = Color(0xFF20202A)
val Muted = Color(0xFF74717A)
val Divider = Color(0xFFE7E0D6)
val Opuscule = Color(0xFF6552C8)
val OpusculeSoft = Color(0xFFEDE9FF)
val KnowledgeBlue = Color(0xFF316B9E)
val KnowledgeBlueSoft = Color(0xFFE7F2FB)
val Sage = Color(0xFF4F7A65)
val SageSoft = Color(0xFFE8F2EC)
val Amber = Color(0xFFB36B22)
val AmberSoft = Color(0xFFFFEFD9)
val Coral = Color(0xFFC45752)
val CoralSoft = Color(0xFFFFEAE7)
val Danger = Color(0xFFC83D4A)
val DangerSoft = Color(0xFFFFE9EC)
val Success = Color(0xFF287653)
val SuccessSoft = Color(0xFFE5F4EB)
val Warning = Color(0xFFA15F18)

private val Colors = lightColorScheme(
    primary = Opuscule,
    onPrimary = Color.White,
    primaryContainer = OpusculeSoft,
    onPrimaryContainer = Opuscule,
    background = Canvas,
    onBackground = Ink,
    surface = Canvas,
    onSurface = Ink,
    surfaceVariant = Surface,
    onSurfaceVariant = Muted,
    outline = Divider,
    error = Danger,
    errorContainer = DangerSoft,
)

private val AppTypography = Typography(
    displaySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 39.sp, letterSpacing = (-0.6).sp),
    headlineLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.45).sp),
    headlineMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp, letterSpacing = (-0.3).sp),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 25.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 21.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 17.sp, lineHeight = 25.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 21.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 16.sp),
)

@Composable
fun OpusculeTheme(content: @Composable () -> Unit) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Canvas.toArgb()
            window.navigationBarColor = Canvas.toArgb()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isStatusBarContrastEnforced = false
                window.isNavigationBarContrastEnforced = false
            }
            window.decorView.systemUiVisibility =
                android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
                    android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
    }
    MaterialTheme(colorScheme = Colors, typography = AppTypography, content = content)
}
