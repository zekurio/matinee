package io.github.zekurio.matinee.ui.signin

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.DeviceCode
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LogoMark
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.MatineeTextField
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

/** The web's auth screen: the mark and name at the top, the form below the middle. */
@Composable
private fun AuthLayout(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
        Row(
            Modifier.padding(horizontal = 26.dp, vertical = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            LogoMark(Modifier.size(30.dp))
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }
        Column(
            Modifier
                .align(Alignment.Center)
                .widthIn(max = 420.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 26.dp, vertical = 96.dp),
            content = content,
        )
    }
}

@Composable
fun ConnectScreen(session: Session) {
    var address by rememberSaveable { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val connect = {
        if (!busy) {
            busy = true
            error = null
            scope.launch {
                error = session.connect(address)
                busy = false
            }
        }
    }
    AuthLayout {
        Text(stringResource(R.string.connect_title), style = MaterialTheme.typography.headlineMedium)
        Gap(8.dp)
        Text(stringResource(R.string.connect_description), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        Gap(24.dp)
        MatineeTextField(
            value = address,
            onValueChange = { address = it },
            placeholder = stringResource(R.string.connect_placeholder),
            leadingIcon = Lucide.Server,
            isError = error != null,
            enabled = !busy,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go, autoCorrectEnabled = false),
            keyboardActions = KeyboardActions(onGo = { connect() }),
        )
        error?.let {
            Gap(8.dp)
            Text(it, color = Palette.Danger, style = MaterialTheme.typography.bodySmall)
        }
        Gap(16.dp)
        MatineeButton(onClick = { connect() }, enabled = address.isNotBlank() && !busy, modifier = Modifier.fillMaxWidth()) {
            if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = Palette.Background, strokeWidth = 2.dp)
            Text(stringResource(R.string.connect_button))
        }
    }
}

@Composable
fun SignInScreen(session: Session, state: AuthState.SignedOut, browserError: MutableStateFlow<String?>) {
    val context = LocalContext.current
    var withCode by rememberSaveable { mutableStateOf(false) }
    val error by browserError.collectAsState()
    // A TV has no browser to sign in with, so it starts with the code.
    val tv = remember { context.packageManager.hasSystemFeature("android.software.leanback") }
    if (withCode || tv) {
        DeviceCodeSignIn(session, onBack = if (tv) null else ({ withCode = false }))
        return
    }
    AuthLayout {
        Text(stringResource(R.string.signin_title), style = MaterialTheme.typography.headlineMedium)
        Gap(8.dp)
        Text(
            stringResource(R.string.signin_server, state.server),
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
        )
        Gap(28.dp)
        if (state.config.setup != null) {
            Text(stringResource(R.string.signin_setup), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
            Gap(16.dp)
        }
        MatineeButton(
            onClick = {
                browserError.value = null
                openInBrowser(context, session.browserSignInUrl())
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            LucideIcon(if (state.config.passkeys) Lucide.KeyRound else Lucide.LogIn, null, size = 18.dp)
            Text(
                when {
                    state.config.passkeys -> stringResource(R.string.signin_browser)
                    state.config.oidc != null -> stringResource(R.string.signin_oidc, state.config.oidc.displayName)
                    else -> stringResource(R.string.signin_browser)
                },
            )
        }
        Gap(10.dp)
        MatineeButton(onClick = { withCode = true }, look = ButtonLook.Ghost, modifier = Modifier.fillMaxWidth()) {
            LucideIcon(Lucide.Smartphone, null, size = 18.dp)
            Text(stringResource(R.string.signin_with_code))
        }
        error?.let {
            Gap(12.dp)
            Text(it, color = Palette.Danger, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
        Gap(32.dp)
        MatineeButton(onClick = session::forgetServer, look = ButtonLook.Ghost, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(stringResource(R.string.connect_change_server), color = Palette.Muted)
        }
    }
}

/**
 * The OAuth device grant: show a code, and wait while someone signed in
 * enters it on the server's /link page and approves this device.
 */
@Composable
private fun DeviceCodeSignIn(session: Session, onBack: (() -> Unit)?) {
    val context = LocalContext.current
    var code by remember { mutableStateOf<DeviceCode?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    LaunchedEffect(attempt) {
        val api = session.requireApi()
        error = null
        try {
            val started = api.deviceStart(session.deviceName)
            code = started
            while (true) {
                delay(started.interval * 1000L)
                val answer = try {
                    api.devicePoll(started.deviceCode)
                } catch (e: ApiException) {
                    // The code expired: get a new one.
                    if (e.status == 404) {
                        attempt++
                        return@LaunchedEffect
                    }
                    throw e
                }
                if (answer.status == "approved" && answer.token != null && answer.user != null) {
                    session.signedIn(io.github.zekurio.matinee.api.AppSession(answer.token, answer.user))
                    return@LaunchedEffect
                }
            }
        } catch (e: IOException) {
            error = e.message ?: e.javaClass.simpleName
        }
    }
    AuthLayout {
        Text(stringResource(R.string.signin_code_title), style = MaterialTheme.typography.headlineMedium)
        Gap(8.dp)
        val current = code
        Text(
            if (current != null) stringResource(R.string.signin_code_description, current.verificationUri)
            else stringResource(R.string.signin_code_loading),
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
        )
        Gap(28.dp)
        Box(
            Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (current != null) {
                Text(
                    current.userCode,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = if (isWide()) 56.sp else 40.sp,
                    letterSpacing = 4.sp,
                )
            } else {
                CircularProgressIndicator(color = Palette.Accent)
            }
        }
        Gap(20.dp)
        if (current != null) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(14.dp), color = Palette.Muted, strokeWidth = 2.dp)
                Text(stringResource(R.string.signin_code_waiting), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
            }
            Gap(24.dp)
            MatineeButton(
                onClick = { openInBrowser(context, current.verificationUriComplete) },
                look = ButtonLook.Outline,
                modifier = Modifier.fillMaxWidth(),
            ) {
                LucideIcon(Lucide.Link, null, size = 18.dp)
                Text(stringResource(R.string.signin_code_open))
            }
        }
        error?.let {
            Gap(12.dp)
            Text(it, color = Palette.Danger, style = MaterialTheme.typography.bodySmall)
            Gap(8.dp)
            MatineeButton(onClick = { attempt++ }, look = ButtonLook.Outline, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.common_retry))
            }
        }
        if (onBack != null) {
            Gap(12.dp)
            MatineeButton(onClick = onBack, look = ButtonLook.Ghost, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.signin_code_back))
            }
        }
    }
}

/** A Custom Tab in the app's colors, or whatever opens web links. */
fun openInBrowser(context: Context, url: String) {
    val uri = Uri.parse(url)
    val colors = CustomTabColorSchemeParams.Builder()
        .setToolbarColor(Palette.Background.toArgb())
        .setNavigationBarColor(Palette.Background.toArgb())
        .build()
    val tab = CustomTabsIntent.Builder()
        .setDefaultColorSchemeParams(colors)
        .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
        .setShowTitle(true)
        .build()
    try {
        tab.launchUrl(context, uri)
    } catch (_: android.content.ActivityNotFoundException) {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    }
}
