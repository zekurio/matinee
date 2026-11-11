package io.github.zekurio.matinee.ui.tv

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import io.github.zekurio.matinee.api.Artwork
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.ui.components.LocalApi

/**
 * A title as its [logo], fit into [modifier]'s size, or as [name] when it
 * has none or the logo won't load. A logo is see-through, so it's drawn
 * with no blurred stand-in beneath it, which would show as a dark box.
 */
@Composable
fun TvTitleLogo(
    name: String,
    logo: Artwork?,
    modifier: Modifier,
    alignment: Alignment = Alignment.CenterStart,
    nameText: @Composable () -> Unit,
) {
    val api = LocalApi.current
    var failed by remember(logo?.id) { mutableStateOf(false) }
    if (logo != null && !failed) {
        AsyncImage(
            model = api.paths.artwork(logo.id, ArtworkSize.Medium),
            contentDescription = name,
            contentScale = ContentScale.Fit,
            alignment = alignment,
            onError = { failed = true },
            modifier = modifier,
        )
    } else {
        nameText()
    }
}
