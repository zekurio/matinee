import MatineeCore
import MatineeKit
import SwiftUI

/*
 * GridHeader.kt: the top of a grid page, its name with a count after it,
 * and a row of controls under them, the sort, the filters, and a search
 * or a kind, which steps aside once focus is below the first row of
 * posters (the kit's `TVPosterGrid`). Under the controls, the filters in
 * use, each a button that takes itself off, as the phone's chips; Android
 * TV has only a genre, which its button names.
 */

/// The key a grid page's controls have in its focus memory, and the sort button's.
enum GridControls {
  static let row = "controls"
  static let sort = "sort"
  static let filters = "filters"
}

/// The top of a grid page: `title` with `detail` after it, like a count,
/// the `controls` under them, and the filters in use under those.
struct TVGridHeader<Controls: View>: View {
  let title: String
  let detail: String?
  var chips: [TitleFilterChip] = []
  var onRemove: (TitleFilterChip) -> Void = { _ in }
  var onClear: () -> Void = {}
  @ViewBuilder let controls: () -> Controls
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .firstTextBaseline, spacing: TVSpace.s4) {
        Text(title).textStyle(.headline).lineLimit(1).layoutPriority(1)
        if let detail {
          Text(detail).textStyle(.facts).foregroundStyle(palette.mutedForeground).lineLimit(1)
        }
      }
      // Clear of the clock at the top right.
      .padding(.trailing, TVPage.end + TVGrid.clockRoom)
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isHeader)
      HStack(spacing: TVButtons.gap) { controls() }
        .frame(height: TVButtons.height)
        .padding(.top, TVSpace.s4)
        .padding(.trailing, TVPage.end)
      if !chips.isEmpty {
        ScrollView(.horizontal) {
          HStack(spacing: TVSpace.s3) {
            ForEach(chips, id: \.key) { chip in
              let label = titleFilterChipText(chip)
              TVButton(label, trailingIcon: .x, active: true) { onRemove(chip) }
                .accessibilityLabel(Str.browseRemoveFilter(label))
            }
            if chips.count > 1 {
              TVButton(Str.browseClearAll, action: onClear)
            }
          }
          .padding(.trailing, TVPage.end)
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        .padding(.top, TVSpace.s4)
        .focusSection()
      }
    }
    .padding(.leading, TVPage.start)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The sort button, naming the order in force, and the filters button with
/// how many are on, as a grid page's first controls. Both open a panel at
/// the right; focus comes back to them as it closes.
struct GridSortAndFilters: View {
  let state: TitleListState
  let memory: TVFocusMemory
  let onSort: () -> Void
  let onFilters: () -> Void
  @FocusState private var focused: String?

  var body: some View {
    let active = state.activeFilters
    HStack(spacing: TVButtons.gap) {
      TVButton(
        state.currentOrder.map(titleOrderText) ?? Str.librarySort, icon: .arrowUpDown, trailingIcon: .chevronDown,
        action: onSort
      )
      .focused($focused, equals: GridControls.sort)
      .accessibilityLabel(Str.browseSortCurrent(state.currentOrder.map(titleOrderText) ?? Str.librarySortName))
      TVButton(
        Str.webFiltersTitle, icon: .listFilter, detail: active > 0 ? formatCount(active) : nil,
        trailingIcon: .chevronDown, active: active > 0, action: onFilters
      )
      .focused($focused, equals: GridControls.filters)
      .accessibilityLabel(active > 0 ? Str.browseFiltersOn(active) : Str.webFiltersTitle)
    }
    .tvFocusRow(GridControls.row, memory: memory, focused: $focused, first: GridControls.sort)
  }
}
