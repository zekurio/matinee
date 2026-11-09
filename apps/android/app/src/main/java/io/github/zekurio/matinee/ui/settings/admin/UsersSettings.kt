package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.admin.AdminUser
import io.github.zekurio.matinee.api.admin.adminUsers
import io.github.zekurio.matinee.api.admin.removeUser
import io.github.zekurio.matinee.api.admin.setUserRole
import io.github.zekurio.matinee.api.admin.signOutUser
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.Badge
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.SheetHeader
import io.github.zekurio.matinee.ui.components.SheetItem
import io.github.zekurio.matinee.ui.formatInstant
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** What an admin is about to do to an account, waiting for a yes. */
private sealed interface UserAction {
    val user: AdminUser

    data class Role(override val user: AdminUser, val admin: Boolean) : UserAction

    data class SignOut(override val user: AdminUser) : UserAction

    data class Delete(override val user: AdminUser) : UserAction
}

/**
 * Everyone's accounts, as the web's users panel: who they are, how they
 * sign in, and when they were last here. A tap offers the admin role,
 * signing out everywhere, and deleting the account, each asked first.
 */
@Composable
fun UsersSettings() {
    val loader = rememberLoader("admin-users") { adminUsers() }
    var acting by remember { mutableStateOf<AdminUser?>(null) }
    var confirming by remember { mutableStateOf<UserAction?>(null) }
    // The page's, so a save goes on after its dialog or sheet closes.
    val saver = rememberSaver()
    val scope = rememberCoroutineScope()
    SettingsScaffold(stringResource(R.string.settings_admin_users)) {
        loaded(loader, { stringResource(R.string.web_users_loadFailed, it) }) { users ->
            item(key = "users") {
                Panel {
                    users.forEachIndexed { index, user ->
                        if (index > 0) RowDivider()
                        UserRow(user) { acting = user }
                    }
                }
            }
        }
    }
    val admins = (loader.state as? Load.Ready)?.value.orEmpty().count { it.isAdmin }
    acting?.let { user -> UserSheet(user, lastAdmin = user.isAdmin && admins <= 1, scope, onPick = { confirming = it }) { acting = null } }
    confirming?.let { action -> Confirm(action, saver, loader::reload) { confirming = null } }
}

@Composable
private fun UserRow(user: AdminUser, onClick: () -> Unit) {
    val api = LocalApi.current
    val res = LocalResources.current
    val self = LocalUser.current.id == user.id
    val signIn = listOfNotNull(
        user.passkeys.takeIf { it > 0 }?.let { res.getQuantityString(R.plurals.web_users_passkeys, it, it) },
        if (user.oidcLinked) "SSO" else null,
    ).ifEmpty { listOf(stringResource(R.string.web_users_noSignIn)) }
    val seen = user.lastSeenAt?.let { stringResource(R.string.web_users_lastSeen, formatInstant(it)) }
        ?: stringResource(R.string.web_users_joined, formatInstant(user.createdAt))
    Row(
        Modifier.fillMaxWidth().clickable(onClickLabel = stringResource(R.string.web_users_actions, user.name), onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 40.dp)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (self) "${user.name} ${stringResource(R.string.web_users_you)}" else user.name,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (user.isAdmin) Badge(stringResource(R.string.web_users_admin), outlined = true)
            }
            Text(
                (signIn + seen).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** What can be done to an account: its role, its sessions, the account itself. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UserSheet(user: AdminUser, lastAdmin: Boolean, scope: CoroutineScope, onPick: (UserAction) -> Unit, onDismiss: () -> Unit) {
    val self = LocalUser.current.id == user.id
    val snackbar = LocalSnackbar.current
    val lastAdminNote = stringResource(R.string.web_users_lastAdmin)
    val pick = { action: UserAction ->
        onDismiss()
        // The server keeps one admin who can sign in; say so before asking.
        if (lastAdmin && (action is UserAction.Delete || (action is UserAction.Role && !action.admin))) {
            scope.launch { snackbar.showSnackbar(lastAdminNote) }
        } else {
            onPick(action)
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            SheetHeader(user.name, "@${user.username}")
            SheetItem(
                Lucide.Shield,
                stringResource(
                    when {
                        !user.isAdmin -> R.string.web_users_menu_makeAdmin
                        self -> R.string.web_users_menu_stepDown
                        else -> R.string.web_users_menu_removeAdmin
                    },
                ),
            ) { pick(UserAction.Role(user, admin = !user.isAdmin)) }
            SheetItem(Lucide.LogOut, stringResource(if (self) R.string.web_users_menu_signOutOthers else R.string.web_users_menu_signOut)) {
                pick(UserAction.SignOut(user))
            }
            SheetItem(Lucide.Trash, stringResource(if (self) R.string.web_users_menu_deleteOwn else R.string.web_users_menu_delete), destructive = true) {
                pick(UserAction.Delete(user))
            }
        }
    }
}

/** The question for [action], and doing it on a yes. */
@Composable
private fun Confirm(action: UserAction, saver: Saver, reload: () -> Unit, onDismiss: () -> Unit) {
    val api = LocalApi.current
    val res = LocalResources.current
    val session = LocalContext.current.app.session
    val snackbar = LocalSnackbar.current
    val user = action.user
    val self = LocalUser.current.id == user.id
    when (action) {
        is UserAction.Role -> {
            val stepDown = self && !action.admin
            ConfirmDialog(
                title = when {
                    action.admin -> stringResource(R.string.web_users_role_makeTitle, user.name)
                    stepDown -> stringResource(R.string.web_users_role_stepDownTitle)
                    else -> stringResource(R.string.web_users_role_removeTitle, user.name)
                },
                body = stringResource(
                    when {
                        action.admin -> R.string.web_users_role_makeDescription
                        stepDown -> R.string.web_users_role_stepDownDescription
                        else -> R.string.web_users_role_removeDescription
                    },
                ),
                confirm = stringResource(
                    when {
                        action.admin -> R.string.web_users_role_makeConfirm
                        stepDown -> R.string.web_users_role_stepDownConfirm
                        else -> R.string.web_users_role_removeConfirm
                    },
                ),
                onConfirm = {
                    saver {
                        api.setUserRole(user.id, if (action.admin) "admin" else "user")
                        snackbar.showSnackbar(
                            when {
                                action.admin -> res.getString(R.string.web_users_madeAdmin, user.name)
                                stepDown -> res.getString(R.string.web_users_steppedDown)
                                else -> res.getString(R.string.web_users_removedAdmin, user.name)
                            },
                        )
                        // Without the role, the admin pages are gone; the app asks the server who it is again.
                        if (stepDown) session.start() else reload()
                    }
                },
                onDismiss = onDismiss,
            )
        }
        is UserAction.SignOut -> ConfirmDialog(
            title = if (self) stringResource(R.string.web_users_signOut_ownTitle) else stringResource(R.string.web_users_signOut_title, user.name),
            body = stringResource(if (self) R.string.web_users_signOut_ownDescription else R.string.web_users_signOut_description),
            confirm = stringResource(if (self) R.string.web_users_signOut_ownConfirm else R.string.web_users_signOut_confirm),
            onConfirm = {
                saver {
                    val ended = api.signOutUser(user.id)
                    snackbar.showSnackbar(
                        if (self) res.getQuantityString(R.plurals.web_users_endedOwnSessions, ended, ended)
                        else res.getQuantityString(R.plurals.web_users_endedSessions, ended, ended, user.name),
                    )
                    reload()
                }
            },
            onDismiss = onDismiss,
        )
        is UserAction.Delete -> ConfirmDialog(
            title = if (self) stringResource(R.string.web_users_delete_ownTitle) else stringResource(R.string.web_users_delete_title, user.name),
            body = stringResource(if (self) R.string.web_users_delete_ownDescription else R.string.web_users_delete_description),
            confirm = stringResource(if (self) R.string.web_users_delete_ownConfirm else R.string.web_users_delete_confirm),
            onConfirm = {
                saver {
                    api.removeUser(user.id)
                    // An account gone, its session with it.
                    if (self) {
                        session.signOut()
                    } else {
                        snackbar.showSnackbar(res.getString(R.string.web_users_deleted, user.name))
                        reload()
                    }
                }
            },
            onDismiss = onDismiss,
        )
    }
}
