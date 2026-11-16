package io.github.zekurio.matinee.ui.home

import android.content.Context
import android.net.Uri
import io.github.zekurio.matinee.BuildConfig
import io.github.zekurio.matinee.api.FeaturedTitle
import io.github.zekurio.matinee.ui.components.ImageSource
import java.io.File
import java.util.Properties

/*
 * Real pictures for Home's featured carousel and the tablet's banner
 * (Hero.kt), for judging text on them, which the dev server's test
 * patterns can't tell. Debug builds
 * only, by build type: they aren't debuggable, so BuildConfig.DEBUG is
 * false in them too. A release reads nothing. No picture is in the
 * repository; they're pushed to the device, into the folder the app makes
 * for them (pushing first would make it the shell's, which the app can't
 * read):
 *
 *     adb push <folder>/. /sdcard/Android/data/io.github.zekurio.matinee.debug/files/featured-art/
 *
 * - The folder's pictures (jpg, png, webp), one per card in name order. A
 *   file's name, less a leading number, is the card's, `_` standing for
 *   `:`, with genres in brackets after it:
 *   `1 The Hunger Games_ Catching Fire [Action, Adventure].jpg`. With more
 *   pictures than featured titles, the titles repeat under the new names.
 * - `dev.properties` beside them, each line optional:
 *   - `count=2`: only the first that many cards.
 *   - `fallback=2:none,3:poster`: the second card with no picture at all,
 *     the third with its picture as the title's poster only.
 *   - `stop=1.5`: opens resting at that card, the first being 0, or part
 *     of the way to the next, as a swipe leaves it; and holds there.
 *   - `open=actions`: the first card's long press, once it shows.
 *
 * The iPhone app's HomeCarouselDevData.swift reads the same names from a
 * folder on the Mac.
 */

/** A card's picture in place of the server's. */
internal sealed interface StandInArt {
    data class Backdrop(val source: ImageSource) : StandInArt

    data class Poster(val source: ImageSource) : StandInArt

    data object None : StandInArt
}

/** What the folder asks of the carousel. */
internal class HomeCarouselDevData(
    private val pictures: List<Picked>,
    private val count: Int?,
    private val fallbacks: Map<Int, String>,
    /** Where the carousel opens, in cards, and holds. */
    val startStop: Float?,
    /** Whether the first card's actions open once it shows. */
    val opensActions: Boolean,
) {
    internal data class Picked(val file: File, val name: String, val genres: List<String>)

    /** The featured titles with the folder's names and genres, as many as it has pictures, cut to `count`. */
    fun slides(slides: List<FeaturedTitle>): List<FeaturedTitle> {
        var result = slides
        if (pictures.isNotEmpty() && slides.isNotEmpty()) {
            result = pictures.mapIndexed { index, picked ->
                val slide = slides[index % slides.size]
                slide.copy(title = slide.title.copy(name = picked.name, genres = picked.genres.ifEmpty { slide.title.genres }))
            }
        }
        return count?.let { result.take(it.coerceAtLeast(0)) } ?: result
    }

    /** The picture card [index] shows instead of the server's, if any. */
    fun art(index: Int): StandInArt? {
        val picture = pictures.takeIf { it.isNotEmpty() }?.let { ImageSource(Uri.fromFile(it[index % it.size].file).toString()) }
        return when (fallbacks[index]) {
            "none" -> StandInArt.None
            "poster" -> picture?.let { StandInArt.Poster(it) }
            else -> picture?.let { StandInArt.Backdrop(it) }
        }
    }

    companion object {
        private val PICTURE = setOf("jpg", "jpeg", "png", "webp")

        /** The folder's stand-ins, or null in a release build or without the folder. */
        fun read(context: Context): HomeCarouselDevData? {
            if (BuildConfig.BUILD_TYPE != "debug") return null
            val folder = context.getExternalFilesDir("featured-art")?.takeIf { it.isDirectory } ?: return null
            val settings = Properties()
            File(folder, "dev.properties").takeIf { it.isFile }?.reader()?.use(settings::load)
            val pictures = folder.listFiles().orEmpty()
                .filter { it.extension.lowercase() in PICTURE }
                .sortedWith(compareBy({ leadingNumber(it.name) }, { it.name }))
                .map(::picked)
            val fallbacks = settings.getProperty("fallback").orEmpty().split(",").mapNotNull { pair ->
                val (card, kind) = pair.split(":").takeIf { it.size == 2 } ?: return@mapNotNull null
                card.trim().toIntOrNull()?.let { (it - 1) to kind.trim() }
            }.toMap()
            if (pictures.isEmpty() && settings.isEmpty) return null
            return HomeCarouselDevData(
                pictures,
                settings.getProperty("count")?.trim()?.toIntOrNull(),
                fallbacks,
                settings.getProperty("stop")?.trim()?.toFloatOrNull(),
                settings.getProperty("open")?.trim() == "actions",
            )
        }

        private fun leadingNumber(name: String) = Regex("""^\d+""").find(name)?.value?.toIntOrNull() ?: Int.MAX_VALUE

        private fun picked(file: File): Picked {
            var stem = file.nameWithoutExtension
            var genres = emptyList<String>()
            val open = stem.indexOf('[')
            val close = stem.lastIndexOf(']')
            if (open in 0 until close) {
                genres = stem.substring(open + 1, close).split(",").map { it.trim() }.filter { it.isNotEmpty() }
                stem = stem.substring(0, open)
            }
            val name = stem.replace(Regex("""^\d+\s+"""), "").replace("_", ":").trim()
            return Picked(file, name, genres)
        }
    }
}
