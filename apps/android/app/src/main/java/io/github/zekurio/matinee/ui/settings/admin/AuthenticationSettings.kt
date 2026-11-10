package io.github.zekurio.matinee.ui.settings.admin

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.AdminAuthSettings
import io.github.zekurio.matinee.api.AuthSettingsInput
import io.github.zekurio.matinee.api.Explicit
import io.github.zekurio.matinee.api.OidcSettingsInput
import io.github.zekurio.matinee.api.PasskeySettings
import io.github.zekurio.matinee.ui.Reveal
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.settings.SwitchRow
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.launch

/**
 * How people sign in, as the web's authentication panel: passkeys, and the
 * OpenID Connect provider for single sign-on. The fields save together;
 * an empty one falls back to what the server's environment sets, which it
 * shows as the field's placeholder.
 */
@Composable
fun AuthenticationSettings() {
    val api = LocalApi.current
    val loader = rememberLoader("admin-auth") { admin.auth.get() }
    val saver = rememberSaver()
    SettingsScaffold(stringResource(R.string.settings_admin_authentication)) {
        loaded(loader, { stringResource(R.string.web_oidc_loadFailed, it) }) { saved ->
            item(key = "form") {
                AuthForm(saved, saver) { settings -> saver { loader.show(api.admin.auth.update(settings)) } }
            }
        }
    }
}

@Composable
private fun AuthForm(saved: AdminAuthSettings, saver: Saver, save: (AuthSettingsInput) -> Unit) {
    val res = LocalResources.current
    var passkeys by remember(saved) { mutableStateOf(saved.passkeys) }
    var oidc by remember(saved) { mutableStateOf(saved.oidc) }
    var secret by remember(saved) { mutableStateOf("") }
    var dropSecret by remember(saved) { mutableStateOf(false) }
    var advanced by rememberSaveable { mutableStateOf(false) }
    // A new secret to save, the saved one dropped, or the saved one kept.
    val change: Explicit<String>? = when {
        secret.isNotBlank() -> Explicit(secret.trim())
        dropSecret -> Explicit(null)
        else -> null
    }
    val dirty = passkeys != saved.passkeys || oidc != saved.oidc || change != null
    val defaults = saved.defaults
    val provider = oidc.displayName.ifBlank { defaults.displayName }.ifBlank { stringResource(R.string.web_oidc_title) }
    val issuerError = oidc.issuerUrl.takeIf { it.isNotBlank() && !Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(it) }
        ?.let { stringResource(R.string.web_oidc_checkField, stringResource(R.string.web_oidc_field_issuerUrl)) }
    val scopesError = oidc.scopes.takeIf { it.isNotBlank() && "openid" !in it.split(Regex("\\s+")) }
        ?.let { stringResource(R.string.web_oidc_scopes_description) }

    Column {
        Section(stringResource(R.string.web_oidc_passkeys_title)) {
            Panel {
                SwitchRow(stringResource(R.string.web_oidc_passkeys_title), passkeys.enabled, icon = Lucide.KeyRound) { passkeys = PasskeySettings(it) }
            }
            // Accounts that can only sign in with a passkey, told before they're locked out.
            if (!passkeys.enabled && saved.unlinkedUsers > 0) {
                Gap(8.dp)
                Text(
                    res.getQuantityString(R.plurals.web_oidc_passkeys_unlinked, saved.unlinkedUsers, saved.unlinkedUsers, provider),
                    style = MaterialTheme.typography.bodySmall,
                    color = Palette.Danger,
                )
            }
        }
        Gap(28.dp)
        Section(stringResource(R.string.web_oidc_title)) {
            Panel {
                SwitchRow(stringResource(R.string.web_oidc_enabled), oidc.enabled, icon = Lucide.LogIn) { oidc = oidc.copy(enabled = it) }
                RowDivider()
                SwitchRow(stringResource(R.string.web_oidc_allowSignUp), oidc.allowSignUp) { oidc = oidc.copy(allowSignUp = it) }
            }
            if (!oidc.enabled && saved.ssoOnlyUsers > 0) {
                Gap(8.dp)
                Text(
                    res.getQuantityString(R.plurals.web_oidc_ssoOnly, saved.ssoOnlyUsers, saved.ssoOnlyUsers, provider),
                    style = MaterialTheme.typography.bodySmall,
                    color = Palette.Danger,
                )
            }
            Gap(12.dp)
            Panel {
                TextRow(stringResource(R.string.web_oidc_field_displayName), oidc.displayName, { oidc = oidc.copy(displayName = it) }, placeholder = defaults.displayName.ifBlank { null })
                RowDivider()
                TextRow(
                    stringResource(R.string.web_oidc_field_issuerUrl),
                    oidc.issuerUrl,
                    { oidc = oidc.copy(issuerUrl = it) },
                    placeholder = defaults.issuerUrl.ifBlank { "https://auth.example.com" },
                    keyboard = KeyboardType.Uri,
                    error = issuerError,
                )
                RowDivider()
                TextRow(stringResource(R.string.web_oidc_field_clientId), oidc.clientId, { oidc = oidc.copy(clientId = it) }, placeholder = defaults.clientId.ifBlank { null })
                RowDivider()
                TextRow(
                    stringResource(R.string.web_oidc_field_clientSecret),
                    secret,
                    {
                        secret = it
                        // A new secret replaces the saved one, so a removal no longer applies.
                        if (it.isNotEmpty()) dropSecret = false
                    },
                    // What's in use now, while the field is empty.
                    placeholder = when {
                        dropSecret && saved.clientSecret.environment -> stringResource(R.string.web_oidc_clientSecret_environmentApplies)
                        dropSecret -> stringResource(R.string.web_oidc_clientSecret_removed)
                        saved.clientSecret.source == "saved" -> stringResource(R.string.web_oidc_clientSecret_saved)
                        saved.clientSecret.source == "environment" -> stringResource(R.string.web_oidc_clientSecret_fromEnvironment)
                        else -> stringResource(R.string.web_oidc_clientSecret_none)
                    },
                    secret = true,
                    // Remove the saved secret, or take the removal back until the save.
                    trailing = if (saved.clientSecret.source == "saved" && secret.isEmpty()) {
                        {
                            RoundIconButton(
                                if (dropSecret) Lucide.RotateCcw else Lucide.Trash,
                                stringResource(
                                    when {
                                        dropSecret -> R.string.web_oidc_clientSecret_keep
                                        saved.clientSecret.environment -> R.string.web_oidc_clientSecret_useEnvironment
                                        else -> R.string.web_oidc_clientSecret_remove
                                    },
                                ),
                                { dropSecret = !dropSecret },
                                background = Color.Transparent,
                                tint = if (dropSecret) Palette.Muted else Palette.Danger,
                            )
                        }
                    } else {
                        null
                    },
                )
                RowDivider()
                RedirectRow(saved.callbackUrl)
            }
            Gap(12.dp)
            Panel {
                SwitchRow(stringResource(R.string.web_oidc_advanced), advanced, icon = Lucide.Settings) { advanced = it }
                Reveal(advanced) {
                    Column {
                    RowDivider()
                    TextRow(stringResource(R.string.web_oidc_field_scopes), oidc.scopes, { oidc = oidc.copy(scopes = it) }, placeholder = defaults.scopes.ifBlank { "openid profile email" }, error = scopesError)
                    RowDivider()
                    TextRow(stringResource(R.string.web_oidc_field_usernameClaim), oidc.usernameClaim, { oidc = oidc.copy(usernameClaim = it) }, placeholder = defaults.usernameClaim.ifBlank { "preferred_username" })
                    RowDivider()
                    TextRow(stringResource(R.string.web_oidc_field_roleClaim), oidc.roleClaim, { oidc = oidc.copy(roleClaim = it) }, placeholder = defaults.roleClaim.ifBlank { null })
                    }
                }
            }
        }
        Gap(20.dp)
        SaveButtons(
            dirty = dirty && issuerError == null && scopesError == null,
            saver = saver,
            onReset = {
                passkeys = saved.passkeys
                oidc = saved.oidc
                secret = ""
                dropSecret = false
            },
        ) {
            save(
                AuthSettingsInput(
                    passkeys = passkeys,
                    oidc = OidcSettingsInput(
                        enabled = oidc.enabled,
                        allowSignUp = oidc.allowSignUp,
                        displayName = oidc.displayName,
                        issuerUrl = oidc.issuerUrl,
                        clientId = oidc.clientId,
                        scopes = oidc.scopes,
                        usernameClaim = oidc.usernameClaim,
                        roleClaim = oidc.roleClaim,
                        clientSecret = change,
                    ),
                ),
            )
        }
    }
}

/** The redirect URI to register with the provider, with a way to copy it. */
@Composable
private fun RedirectRow(url: String) {
    val context = LocalContext.current
    val snackbar = LocalSnackbar.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val copied = stringResource(R.string.web_oidc_copied)
    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.web_oidc_redirectUri), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
            Text(url, style = MaterialTheme.typography.bodyMedium)
        }
        RoundIconButton(Lucide.Link, stringResource(R.string.web_oidc_copy), {
            context.getSystemService(Context.CLIPBOARD_SERVICE).let { it as? ClipboardManager }
                ?.setPrimaryClip(ClipData.newPlainText(url, url))
            scope.launch { snackbar.showSnackbar(copied) }
        }, background = Color.Transparent)
    }
}
