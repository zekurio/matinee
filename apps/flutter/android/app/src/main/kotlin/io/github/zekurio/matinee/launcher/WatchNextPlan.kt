package io.github.zekurio.matinee.launcher

/** A row of ours in the launcher's table: its id there, whether the person hid it, and its columns as text. */
internal data class WatchNextRow(val id: Long, val browsable: Boolean, val engagementMillis: Long?, val values: Map<String, String?>)

/**
 * What the app remembers between syncs, by file: when the card the person
 * removed was last watched, and what it published with which watch time. A
 * card that was published and is gone from the table was removed too.
 */
internal data class WatchNextMemory(val dismissed: Map<String, Long> = emptyMap(), val published: Map<String, Long> = emptyMap())

/** A row's columns as they're written: text, whole numbers, or nothing. */
internal typealias WatchNextColumns = Map<String, Any?>

/** What a sync writes: the rows to delete, add, and change, in that order, and what to remember after. */
internal data class WatchNextPlan(
    val delete: List<Long>,
    val insert: List<WatchNextColumns>,
    val update: List<Pair<Long, WatchNextColumns>>,
    val memory: WatchNextMemory,
)

/**
 * A removed card comes back only once the person watched the file again: it
 * has a position, and the server's watch time is later than when it went.
 * Another sync alone never brings it back.
 */
internal fun WatchNextProgramMessage.watchedAfter(dismissedAt: Long): Boolean {
    val engagement = engagementMillis
    return (positionMillis ?: 0) > 0 && engagement != null && engagement > dismissedAt
}

/**
 * Turns the table as it is ([rows], by file) into [programs]. Rows keep their
 * ids, and one whose columns are the same isn't written. A launcher hides a
 * card the person removes (`browsable=0`, which only it may write) or deletes
 * its row; either way the file stays out until [watchedAfter].
 */
internal fun planWatchNext(
    rows: Map<String, WatchNextRow>,
    memory: WatchNextMemory,
    programs: List<WatchNextProgramMessage>,
    columns: (WatchNextProgramMessage) -> WatchNextColumns,
): WatchNextPlan {
    val dismissed = memory.dismissed.toMutableMap()
    for ((itemId, row) in rows) {
        if (!row.browsable && itemId !in dismissed) dismissed[itemId] = row.engagementMillis ?: NEVER
    }
    for ((itemId, engagement) in memory.published) {
        if (itemId !in rows && itemId !in dismissed) dismissed[itemId] = engagement
    }
    val wanted = programs.map { it.itemId }.toSet()
    val delete = rows.filterKeys { it !in wanted }.values.map { it.id }.toMutableList()
    val published = rows.filterKeys { it in wanted }.mapValues { it.value.engagementMillis ?: NEVER }.toMutableMap()
    val insert = mutableListOf<WatchNextColumns>()
    val update = mutableListOf<Pair<Long, WatchNextColumns>>()
    for (program in programs.distinctBy { it.itemId }) {
        var row = rows[program.itemId]
        val dismissedAt = dismissed[program.itemId]
        if (dismissedAt != null) {
            if (!program.watchedAfter(dismissedAt)) continue
            // Only the launcher may show a hidden row again, so a new one takes its place.
            row?.let { delete += it.id }
            row = null
            dismissed -= program.itemId
        }
        val values = columns(program)
        if (row == null) {
            insert += values
        } else if (values.any { (name, value) -> row.values[name] != value?.toString() }) {
            update += row.id to values
        }
        published[program.itemId] = program.engagementMillis ?: NEVER
    }
    return WatchNextPlan(delete, insert, update, WatchNextMemory(dismissed, published))
}

/** The watch time of a card that has none: earlier than any the server sends. */
private const val NEVER = -1L
