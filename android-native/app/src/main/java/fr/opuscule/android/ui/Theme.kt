package fr.opuscule.android.ui

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

data class OpusculePalette(
    val canvas: Color,
    val surface: Color,
    val surfacePressed: Color,
    val readingPaper: Color,
    val ink: Color,
    val muted: Color,
    val divider: Color,
    val accent: Color,
    val accentSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val success: Color,
    val successSoft: Color,
    val warning: Color,
)

private val LightPalette = OpusculePalette(
    canvas = Color(0xFFF7F8FC),
    surface = Color(0xFFEDF1F8),
    surfacePressed = Color(0xFFE1E7F1),
    readingPaper = Color(0xFFFFFFFF),
    ink = Color(0xFF172033),
    muted = Color(0xFF626D80),
    divider = Color(0xFFD9E0EB),
    accent = Color(0xFF1769FF),
    accentSoft = Color(0xFFE7F0FF),
    danger = Color(0xFFD83B53),
    dangerSoft = Color(0xFFFFE8ED),
    success = Color(0xFF16855B),
    successSoft = Color(0xFFE2F5EB),
    warning = Color(0xFFB86A0C),
)

private val DarkPalette = OpusculePalette(
    canvas = Color(0xFF000000),
    surface = Color(0xFF111111),
    surfacePressed = Color(0xFF1C1C1C),
    readingPaper = Color(0xFF080808),
    ink = Color(0xFFF7F3EA),
    muted = Color(0xFFAAA49A),
    divider = Color(0xFF292929),
    accent = Color(0xFFC6A15B),
    accentSoft = Color(0xFF2A2112),
    danger = Color(0xFFFF716B),
    dangerSoft = Color(0xFF351615),
    success = Color(0xFF78C59A),
    successSoft = Color(0xFF112A1C),
    warning = Color(0xFFE7A95D),
)

private val LocalOpusculePalette = compositionLocalOf { LightPalette }
val LocalCompactInterface = compositionLocalOf { true }
val LocalReadingFontSize = compositionLocalOf { 17.5f }
val LocalIsDarkTheme = compositionLocalOf { false }

val Canvas: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.canvas
val Surface: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.surface
val SurfacePressed: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.surfacePressed
val ReadingPaper: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.readingPaper
val Ink: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.ink
val Muted: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.muted
val Divider: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.divider
val Opuscule: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.accent
val OpusculeSoft: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.accentSoft
val KnowledgeBlue: Color @Composable @ReadOnlyComposable get() = Opuscule
val KnowledgeBlueSoft: Color @Composable @ReadOnlyComposable get() = OpusculeSoft
val Sage: Color @Composable @ReadOnlyComposable get() = Opuscule
val SageSoft: Color @Composable @ReadOnlyComposable get() = OpusculeSoft
val Amber: Color @Composable @ReadOnlyComposable get() = Opuscule
val AmberSoft: Color @Composable @ReadOnlyComposable get() = OpusculeSoft
val Coral: Color @Composable @ReadOnlyComposable get() = Opuscule
val CoralSoft: Color @Composable @ReadOnlyComposable get() = OpusculeSoft
val Danger: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.danger
val DangerSoft: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.dangerSoft
val Success: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.success
val SuccessSoft: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.successSoft
val Warning: Color @Composable @ReadOnlyComposable get() = LocalOpusculePalette.current.warning

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
fun OpusculeTheme(
    themeMode: String = "system",
    compactInterface: Boolean = true,
    readingFontSize: Float = 17.5f,
    content: @Composable () -> Unit,
) {
    val systemDark = isSystemInDarkTheme()
    val dark = when (themeMode) {
        "dark" -> true
        "light" -> false
        else -> systemDark
    }
    val palette = if (dark) DarkPalette else LightPalette
    val colors = if (dark) {
        darkColorScheme(
            primary = palette.accent,
            onPrimary = Color(0xFF160F04),
            primaryContainer = palette.accentSoft,
            onPrimaryContainer = palette.ink,
            background = palette.canvas,
            onBackground = palette.ink,
            surface = palette.readingPaper,
            onSurface = palette.ink,
            surfaceVariant = palette.surface,
            onSurfaceVariant = palette.muted,
            outline = palette.divider,
            error = palette.danger,
            errorContainer = palette.dangerSoft,
        )
    } else {
        lightColorScheme(
            primary = palette.accent,
            onPrimary = Color.White,
            primaryContainer = palette.accentSoft,
            onPrimaryContainer = palette.accent,
            background = palette.canvas,
            onBackground = palette.ink,
            surface = palette.readingPaper,
            onSurface = palette.ink,
            surfaceVariant = palette.surface,
            onSurfaceVariant = palette.muted,
            outline = palette.divider,
            error = palette.danger,
            errorContainer = palette.dangerSoft,
        )
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = palette.canvas.toArgb()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isStatusBarContrastEnforced = false
                window.isNavigationBarContrastEnforced = false
            }
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
    }

    CompositionLocalProvider(
        LocalOpusculePalette provides palette,
        LocalCompactInterface provides compactInterface,
        LocalReadingFontSize provides readingFontSize,
        LocalIsDarkTheme provides dark,
    ) {
        MaterialTheme(colorScheme = colors, typography = AppTypography, content = content)
    }
}
