package io.github.zekurio.matinee.ui

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Screens build from ui/kit, which draws things as the web app does; only
 * the kit, and the theme that feeds Material its colors, reach into
 * material3. Outside them, material3 gives text and its styles, and the
 * divider, and nothing that brings Material's look with it: its sheets,
 * dialogs, menus, switches, progress, snackbars, fields, buttons, or ripple.
 * Each of those has a kit version.
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

    @Test
    fun onlyTheKitReachesIntoMaterial() {
        assertTrue("no sources at ${sources.absolutePath}", sources.isDirectory)
        val found = sources.walk()
            .filter { it.extension == "kt" }
            .filter { file -> owners.none { file.relativeTo(sources).invariantSeparatorsPath.startsWith(it) } }
            .flatMap { file ->
                file.readLines().withIndex().flatMap { (line, text) ->
                    use.findAll(text)
                        .map { it.groupValues[1] }
                        .filter { it !in allowed }
                        .map { "${file.relativeTo(sources).invariantSeparatorsPath}:${line + 1} uses material3.$it" }
                }
            }
            .toList()
        assertTrue("Use the ui/kit version instead:\n" + found.joinToString("\n"), found.isEmpty())
    }
}
