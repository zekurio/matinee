package io.github.zekurio.matinee.ui.browse

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.TitleList
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

private const val PAGE = 60

/** A list of titles the server hands out a page at a time, loading more as it scrolls. */
class TitlePages(private val fetch: suspend (offset: Int, limit: Int) -> TitleList) : ViewModel() {
    val items = mutableStateListOf<TitleSummary>()
    var total by mutableStateOf<Int?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var loading by mutableStateOf(false)
        private set
    private var job: Job? = null

    init {
        more()
    }

    val done get() = total?.let { items.size >= it } ?: false

    fun more() {
        if (loading || done) return
        loading = true
        error = null
        job = viewModelScope.launch {
            try {
                val page = fetch(items.size, PAGE)
                items.addAll(page.items)
                total = page.total
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                error = e.message ?: e.javaClass.simpleName
            } finally {
                loading = false
            }
        }
    }

    fun restart() {
        job?.cancel()
        loading = false
        items.clear()
        total = null
        more()
    }
}

@Composable
fun rememberTitlePages(key: String, fetch: suspend MatineeApi.(offset: Int, limit: Int) -> TitleList): TitlePages {
    val app = LocalContext.current.app
    val pages: TitlePages = viewModel(key = key) {
        val api = app.session.requireApi()
        TitlePages { offset, limit -> api.fetch(offset, limit) }
    }
    // Marks changed elsewhere, like a show watched to the end: show them.
    val version = app.viewer.version
    var seen by remember { mutableStateOf(version) }
    LaunchedEffect(version) {
        if (version != seen) {
            seen = version
            pages.restart()
        }
    }
    return pages
}

/**
 * Posters in as many columns as fit, two on a phone, with [header] spanning
 * the top. Loads the next page when the end comes near.
 */
@Composable
fun PosterGrid(
    pages: TitlePages,
    detail: (TitleSummary) -> String?,
    modifier: Modifier = Modifier,
    empty: @Composable () -> Unit = {},
    header: LazyGridScope.() -> Unit = {},
) {
    val state = rememberLazyGridState()
    val nearEnd by remember {
        derivedStateOf {
            val last = state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= state.layoutInfo.totalItemsCount - 12
        }
    }
    LaunchedEffect(nearEnd, pages.items.size) {
        if (nearEnd) pages.more()
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(150.dp),
        state = state,
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = 32.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        header()
        items(pages.items, key = { it.id }) { title -> PosterCard(title, detail(title)) }
        val error = pages.error
        when {
            error != null && pages.items.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                Box(Modifier.padding(top = 48.dp)) { ErrorBox(error, null, pages::more) }
            }
            pages.loading -> item(span = { GridItemSpan(maxLineSpan) }) {
                Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Palette.Accent)
                }
            }
            pages.done && pages.items.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) { empty() }
        }
        item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.navigationBarsPadding()) }
    }
}

/** A page's heading with a quiet count beside it. */
@Composable
fun PageTitle(title: String, detail: String?, modifier: Modifier = Modifier) {
    Column(modifier.padding(top = 8.dp, bottom = 8.dp)) {
        Text(title, style = MaterialTheme.typography.headlineLarge)
        if (detail != null) {
            Row(Modifier.padding(top = 4.dp)) {
                Text(detail, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
            }
        }
    }
}
