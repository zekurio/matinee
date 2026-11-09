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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.AppSession
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
import io.github.zekurio.matinee.ui.components.QrCode
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.describeFailure
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

/** The mark and name, in the top corner of the sign-in screens. */
@Composable
private fun Brand(modifier: Modifier = Modifier) {
    Row(
        modifier.padding(horizontal = 26.dp, vertical = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        LogoMark(Modifier.size(30.dp))
        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
    }
}

/** The web's auth screen: the mark and name at the top, the form below the middle. */
@Composable
internal fun AuthLayout(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
        Brand()
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
    // A TV has no browser to sign in with, so it only has the code.
    if (withCode || session.isTv) {
        DeviceCodeSignIn(session, onBack = if (session.isTv) null else ({ withCode = false }))
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
 * The OAuth device grant: show a QR code and the code it holds, and wait
 * while someone signed in approves this device. A phone's camera opens the
 * QR code on the server's /link page; the app reads it under Settings,
 * Account. Typing the code at /link works too.
 */
@Composable
private fun DeviceCodeSignIn(session: Session, onBack: (() -> Unit)?) {
    var code by remember { mutableStateOf<DeviceCode?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    val resources = LocalContext.current.resources
    LaunchedEffect(attempt) {
        val api = session.requireApi()
        error = null
        val started = try {
            api.deviceStart(session.deviceName, session.platform)
        } catch (e: IOException) {
            error = describeFailure(resources, e)
            return@LaunchedEffect
        }
        code = started
        while (true) {
            delay(started.interval * 1000L)
            val answer = try {
                api.devicePoll(started.deviceCode)
            } catch (e: ApiException) {
                // The code expired: get a new one, and with it a new QR code.
                if (e.status == 404) {
                    attempt++
                    return@LaunchedEffect
                }
                error = describeFailure(resources, e)
                continue
            } catch (e: IOException) {
                // Wi-Fi dropping, or Android cutting off the network while
                // the browser has the screen: keep asking about the same
                // code, which someone may have approved meanwhile.
                error = describeFailure(resources, e)
                continue
            }
            error = null
            if (answer.status == "approved" && answer.token != null && answer.user != null) {
                session.signedIn(AppSession(answer.token, answer.user))
                return@LaunchedEffect
            }
        }
    }
    val current = code
    val details: @Composable ColumnScope.() -> Unit = {
        // Only a code that never came needs a new start; a poll that failed tries again on its own.
        CodeDetails(current, error, onRetry = if (current == null) ({ attempt++ }) else null)
        Gap(24.dp)
        if (session.isTv) {
            // Nothing else gets a TV out of here, and it may have the wrong server.
            MatineeButton(onClick = session::forgetServer, look = ButtonLook.Ghost) {
                Text(stringResource(R.string.connect_change_server), color = Palette.Muted)
            }
        } else {
            if (current != null) {
                val context = LocalContext.current
                MatineeButton(
                    onClick = { openInBrowser(context, current.verificationUriComplete) },
                    look = ButtonLook.Outline,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    LucideIcon(Lucide.Link, null, size = 18.dp)
                    Text(stringResource(R.string.signin_code_open))
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
    val configuration = LocalConfiguration.current
    // A TV, or a tablet on its side: the steps on the left, the QR code beside them.
    val sideBySide = configuration.screenWidthDp >= 720 &&
        configuration.screenHeightDp >= 480 &&
        configuration.screenWidthDp > configuration.screenHeightDp
    if (sideBySide) {
        Box(Modifier.fillMaxSize().safeDrawingPadding()) {
            Brand()
            Row(
                Modifier
                    .align(Alignment.Center)
                    .widthIn(max = 920.dp)
                    .fillMaxWidth()
                    .padding(horizontal = 56.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(64.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    CodeHeading()
                    Gap(36.dp)
                    details()
                }
                CodeQr(current, 288.dp)
            }
        }
    } else {
        AuthLayout {
            CodeHeading()
            Gap(28.dp)
            CodeQr(current, 224.dp, Modifier.align(Alignment.CenterHorizontally))
            Gap(28.dp)
            details()
        }
    }
}

@Composable
private fun CodeHeading() {
    Text(stringResource(R.string.signin_code_title), style = MaterialTheme.typography.headlineMedium)
    Gap(8.dp)
    Text(stringResource(R.string.signin_code_scan), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
}

/** The QR code of the link page with the code in it, or a spinner while there's no code yet. */
@Composable
private fun CodeQr(code: DeviceCode?, size: Dp, modifier: Modifier = Modifier) {
    if (code == null) {
        Box(modifier.size(size), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Palette.Accent)
        }
        return
    }
    QrCode(code.verificationUriComplete, stringResource(R.string.signin_code_qr, code.userCode), size, modifier)
}

/** The code to type, where to type it, and whether it's still waiting. */
@Composable
private fun CodeDetails(code: DeviceCode?, error: String?, onRetry: (() -> Unit)?) {
    if (code != null) {
        // The page without its scheme: shorter, and what people type anyway.
        Text(
            stringResource(R.string.signin_code_enter, code.verificationUri.substringAfter("://")),
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
        )
        Gap(4.dp)
        Text(
            code.userCode,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.SemiBold,
            fontSize = if (isWide()) 44.sp else 36.sp,
            letterSpacing = 4.sp,
        )
        Gap(20.dp)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CircularProgressIndicator(Modifier.size(14.dp), color = Palette.Muted, strokeWidth = 2.dp)
            Text(stringResource(R.string.signin_code_waiting), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
    } else if (error == null) {
        Text(stringResource(R.string.signin_code_loading), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
    }
    if (error != null) {
        Gap(12.dp)
        Text(error, color = Palette.Danger, style = MaterialTheme.typography.bodySmall)
        if (onRetry != null) {
            Gap(8.dp)
            MatineeButton(onClick = onRetry, look = ButtonLook.Outline, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.common_retry))
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
