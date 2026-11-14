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
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Reveal
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.settings.SwitchRow
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.launch

/** The form's edits to [saved], kept by the page so the save bar can read them. */
private class AuthDraft(val saved: AdminAuthSettings) {
    var passkeys by mutableStateOf(saved.passkeys)
    var oidc by mutableStateOf(saved.oidc)
    var secret by mutableStateOf("")
    var dropSecret by mutableStateOf(false)

    /** A new secret to save, the saved one dropped, or the saved one kept. */
    val change: Explicit<String>?
        get() = when {
            secret.isNotBlank() -> Explicit(secret.trim())
            dropSecret -> Explicit(null)
            else -> null
        }

    val dirty get() = passkeys != saved.passkeys || oidc != saved.oidc || change != null

    val issuerInvalid get() = oidc.issuerUrl.isNotBlank() && !Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(oidc.issuerUrl)
    val scopesInvalid get() = oidc.scopes.isNotBlank() && "openid" !in oidc.scopes.split(Regex("\\s+"))

    fun reset() {
        passkeys = saved.passkeys
        oidc = saved.oidc
        secret = ""
        dropSecret = false
    }

    fun input() = AuthSettingsInput(
        passkeys = passkeys,
        oidc = OidcSettingsInput(
            enabled = oidc.enabled,
            allowSignUp = oidc.allowSignUp,
            // The app has no fields for these yet, so a save keeps what the web set.
            signOutRefused = oidc.signOutRefused,
            displayName = oidc.displayName,
            issuerUrl = oidc.issuerUrl,
            clientId = oidc.clientId,
            scopes = oidc.scopes,
            usernameClaim = oidc.usernameClaim,
            nameClaim = oidc.nameClaim,
            roleClaim = oidc.roleClaim,
            groupsClaim = oidc.groupsClaim,
            policyClaim = oidc.policyClaim,
            clientSecret = change,
        ),
    )
}

/**
 * How people sign in, as the web's authentication panel: passkeys, and the
 * OpenID Connect provider for single sign-on. The fields save together,
 * from the save bar; an empty one falls back to what the server's
 * environment sets, which it shows as the field's placeholder.
 */
@Composable
fun AuthenticationSettings() {
    val api = LocalApi.current
    val loader = rememberLoader("admin-auth") { admin.auth.get() }
    val saved = (loader.state as? Load.Ready)?.value
    val form = remember(saved) { saved?.let(::AuthDraft) }
    SaveBarScaffold(
        stringResource(R.string.settings_admin_authentication),
        dirty = form?.dirty == true,
        canSave = form != null && !form.issuerInvalid && !form.scopesInvalid,
        onReset = { form?.reset() },
        onSave = { form?.let { loader.show(api.admin.auth.update(it.input())) } },
    ) {
        loaded(loader, { stringResource(R.string.web_oidc_loadFailed, it) }) { _ ->
            if (form != null) item(key = "form") { AuthForm(form) }
        }
    }
}

@Composable
private fun AuthForm(form: AuthDraft) {
    val res = LocalResources.current
    val saved = form.saved
    var passkeys by form::passkeys
    var oidc by form::oidc
    var secret by form::secret
    var dropSecret by form::dropSecret
    var advanced by rememberSaveable { mutableStateOf(false) }
    val defaults = saved.defaults
    val provider = oidc.displayName.ifBlank { defaults.displayName }.ifBlank { stringResource(R.string.web_oidc_title) }
    val issuerError = if (form.issuerInvalid) stringResource(R.string.web_oidc_checkField, stringResource(R.string.web_oidc_field_issuerUrl)) else null
    val scopesError = if (form.scopesInvalid) stringResource(R.string.web_oidc_scopes_description) else null

    Column {
        Section(stringResource(R.string.web_oidc_passkeys_title)) {
            Panel {
                SwitchRow(stringResource(R.string.web_oidc_passkeys_title), passkeys.enabled, icon = Lucide.KeyRound) { passkeys = passkeys.copy(enabled = it) }
                RowDivider()
                SwitchRow(stringResource(R.string.web_oidc_passkeys_allowSignUp), passkeys.allowSignUp) { passkeys = passkeys.copy(allowSignUp = it) }
            }
            Gap(8.dp)
            Text(
                stringResource(R.string.web_oidc_passkeys_allowSignUpHint),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
            )
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
                    TextRow(stringResource(R.string.web_oidc_field_nameClaim), oidc.nameClaim, { oidc = oidc.copy(nameClaim = it) }, placeholder = defaults.nameClaim.ifBlank { "name" })
                    RowDivider()
                    TextRow(stringResource(R.string.web_oidc_field_roleClaim), oidc.roleClaim, { oidc = oidc.copy(roleClaim = it) }, placeholder = defaults.roleClaim.ifBlank { null })
                    }
                }
            }
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
