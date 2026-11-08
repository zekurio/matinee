package io.github.zekurio.matinee.ui

import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.api.User
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.browse.BrowseScreen
import io.github.zekurio.matinee.ui.browse.LibraryScreen
import io.github.zekurio.matinee.ui.browse.PersonScreen
import io.github.zekurio.matinee.ui.downloads.DownloadsScreen
import io.github.zekurio.matinee.ui.components.Actions
import io.github.zekurio.matinee.ui.components.ActionsSheet
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.LogoMark
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SheetItem
import io.github.zekurio.matinee.ui.home.HomeScreen
import io.github.zekurio.matinee.ui.player.PlayerScreen
import io.github.zekurio.matinee.ui.search.SearchScreen
import io.github.zekurio.matinee.ui.settings.SettingsScreen
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.title.EpisodeScreen
import io.github.zekurio.matinee.ui.title.SeasonScreen
import io.github.zekurio.matinee.ui.title.TitleScreen

/** The signed-in account. */
val LocalUser = staticCompositionLocalOf<User> { error("not signed in") }

@Composable
fun SignedInApp(session: Session, user: User, offline: Boolean = false) {
    val controller = rememberNavController()
    val navigator = remember(controller) { Navigator(controller) }
    val actionScope = rememberCoroutineScope()
    val actions = remember { Actions(actionScope) }
    val snackbar = remember { SnackbarHostState() }
    CompositionLocalProvider(
        LocalApi provides session.requireApi(),
        LocalNavigator provides navigator,
        LocalActions provides actions,
        LocalSnackbar provides snackbar,
        LocalUser provides user,
        LocalOffline provides offline,
    ) {
        Box(Modifier.fillMaxSize()) {
            NavHost(
                controller,
                startDestination = if (offline) DownloadsRoute else HomeRoute,
                enterTransition = { fadeIn() },
                exitTransition = { fadeOut() },
            ) {
                composable<HomeRoute> { HomeScreen() }
                composable<LibraryRoute> { LibraryScreen(it.toRoute<LibraryRoute>()) }
                composable<TitleRoute> { TitleScreen(it.toRoute<TitleRoute>().id) }
                composable<SeasonRoute> {
                    val route = it.toRoute<SeasonRoute>()
                    SeasonScreen(route.titleId, route.season.takeIf { season -> season >= 0 })
                }
                composable<EpisodeRoute> { EpisodeScreen(it.toRoute<EpisodeRoute>().itemId) }
                composable<PersonRoute> { PersonScreen(it.toRoute<PersonRoute>().name) }
                composable<BrowseRoute> {
                    val route = it.toRoute<BrowseRoute>()
                    BrowseScreen(route.genre, route.studio)
                }
                composable<SearchRoute> { SearchScreen() }
                composable<SettingsRoute> { SettingsScreen(session) }
                composable<DownloadsRoute> { DownloadsScreen() }
                composable<PlayerRoute> {
                    val route = it.toRoute<PlayerRoute>()
                    PlayerScreen(route.itemId, route.start.takeIf { start -> start >= 0 })
                }
            }
            // Keeps the status bar's icons readable over a page scrolled under it.
            val entry by controller.currentBackStackEntryAsState()
            if (entry?.destination?.hasRoute<PlayerRoute>() != true) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .windowInsetsTopHeight(WindowInsets.statusBars)
                        .background(Palette.Background.copy(alpha = 0.55f)),
                )
            }
            SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
        }
        ActionsSheet(actions)
    }
}

/**
 * The phone header: the logo home, search, and the account. It sits at the
 * top of a page and scrolls away with it, over the art of Home's banner and
 * title pages. Pages that aren't Home also get a way back.
 */
@Composable
fun AppHeader(modifier: Modifier = Modifier, back: Boolean = true, search: Boolean = true) {
    val nav = LocalNavigator.current
    val offline = LocalOffline.current
    val user = LocalUser.current
    val api = LocalApi.current
    var account by rememberSaveable { mutableStateOf(false) }
    Box(modifier.fillMaxWidth()) {
        // Keeps the header readable over bright art.
        Box(
            Modifier
                .matchParentSize()
                .padding(bottom = 0.dp)
                .background(Brush.verticalGradient(listOf(Palette.Background.copy(alpha = 0.7f), Color.Transparent))),
        )
        Row(
            Modifier.statusBarsPadding().height(56.dp).fillMaxWidth().padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (back) {
                RoundIconButton(Lucide.ChevronLeft, stringResource(R.string.common_back), nav::back, background = Color.Transparent, iconSize = 24.dp)
            }
            Box(
                Modifier.size(44.dp).clip(CircleShape).clickable(onClickLabel = stringResource(R.string.shell_home_link)) { nav.home() },
                contentAlignment = Alignment.Center,
            ) {
                LogoMark(Modifier.size(28.dp))
            }
            Box(Modifier.weight(1f))
            if (offline) {
                LucideIcon(Lucide.CloudOff, stringResource(R.string.downloads_offline), size = 20.dp, tint = Palette.Muted)
                Box(Modifier.size(12.dp))
            } else if (search) {
                RoundIconButton(Lucide.Search, stringResource(R.string.search_title), nav::search, background = Color.Transparent, iconSize = 22.dp)
            }
            Box(
                Modifier.size(44.dp).clip(CircleShape).clickable(onClickLabel = stringResource(R.string.shell_account, user.name)) { account = true },
                contentAlignment = Alignment.Center,
            ) {
                Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 36.dp)
            }
        }
    }
    if (account) AccountSheet(onDismiss = { account = false })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AccountSheet(onDismiss: () -> Unit) {
    val nav = LocalNavigator.current
    val user = LocalUser.current
    val api = LocalApi.current
    val session = LocalContext.current.app.session
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.navigationBarsPadding().padding(vertical = 12.dp)) {
            Row(
                Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 44.dp)
                Column {
                    Text(user.name, style = MaterialTheme.typography.titleMedium)
                    if (user.displayName != null) Text("@${user.username}", style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
            if (LocalOffline.current) {
                SheetItem(Lucide.RefreshCw, stringResource(R.string.downloads_reconnect)) {
                    onDismiss()
                    session.start()
                }
            } else {
                SheetItem(Lucide.Download, stringResource(R.string.downloads_title)) {
                    onDismiss()
                    nav.downloads()
                }
                SheetItem(Lucide.Settings, stringResource(R.string.shell_settings)) {
                    onDismiss()
                    nav.settings()
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
            SheetItem(Lucide.LogOut, stringResource(R.string.shell_sign_out), destructive = true) {
                onDismiss()
                session.signOut()
            }
        }
    }
}
