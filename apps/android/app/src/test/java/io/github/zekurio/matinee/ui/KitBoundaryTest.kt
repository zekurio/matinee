package io.github.zekurio.matinee.ui

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Screens build from ui/kit, which draws things as the web app does; only
 * the kit, and the theme that feeds Material its colors, reach into
 * material3. Outside them, material3 gives text, the slot for its color,
 * and the divider, none of which has a look of its own. Its sheets, dialogs,
 * menus, switches, progress, snackbars, fields, buttons, and ripple each
 * have a kit version.
 *
 * `MaterialTheme` is only for `.typography`, whose every style Theme.kt
 * sets from the web's. Its `.shapes` are Material's own radii, which the web
 * doesn't use, and `.colorScheme` is Material's names for Palette's colors.
 */
class KitBoundaryTest {
    private val sources = File("src/main/java/io/github/zekurio/matinee")

    private val owners = listOf("ui/kit/", "ui/theme/")

    private val allowed = setOf(
        "Text",
        "MaterialTheme",
        "LocalContentColor",
        "LocalTextStyle",
        "ProvideTextStyle",
        "HorizontalDivider",
        "VerticalDivider",
    )

    private val use = Regex("""androidx\.compose\.material3\.(\w+)""")

    private val theme = Regex("""\bMaterialTheme\.(\w+)""")

    @Test
    fun onlyTheKitReachesIntoMaterial() {
        assertTrue("no sources at ${sources.absolutePath}", sources.isDirectory)
        val found = sources.walk()
            .filter { it.extension == "kt" }
            .filter { file -> owners.none { file.relativeTo(sources).invariantSeparatorsPath.startsWith(it) } }
            .flatMap { file ->
                val path = file.relativeTo(sources).invariantSeparatorsPath
                file.readLines().withIndex().flatMap { (line, text) ->
                    val components = use.findAll(text)
                        .map { it.groupValues[1] }
                        .filter { it !in allowed }
                        .map { "$path:${line + 1} uses material3.$it" }
                    val themeParts = theme.findAll(text)
                        .map { it.groupValues[1] }
                        .filter { it != "typography" }
                        .map { "$path:${line + 1} reads MaterialTheme.$it" }
                    components + themeParts
                }
            }
            .toList()
        assertTrue("Use the ui/kit version instead:\n" + found.joinToString("\n"), found.isEmpty())
    }
}
