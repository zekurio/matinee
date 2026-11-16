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
/// the right; focus comes back to them as it closes. `sortFocus` binds the
/// sort's focus, where a grid with nothing in it starts.
struct GridSortAndFilters: View {
  let state: TitleListState
  let sortFocus: FocusState<Bool>.Binding
  let onSort: () -> Void
  let onFilters: () -> Void

  var body: some View {
    let active = state.activeFilters
    HStack(spacing: TVButtons.gap) {
      TVButton(
        state.currentOrder.map(titleOrderText) ?? Str.librarySort, icon: .arrowUpDown, trailingIcon: .chevronDown,
        action: onSort
      )
      .focused(sortFocus)
      .accessibilityLabel(Str.browseSortCurrent(state.currentOrder.map(titleOrderText) ?? Str.librarySortName))
      TVButton(
        Str.webFiltersTitle, icon: .listFilter, detail: active > 0 ? formatCount(active) : nil,
        trailingIcon: .chevronDown, active: active > 0, action: onFilters
      )
      .accessibilityLabel(active > 0 ? Str.browseFiltersOn(active) : Str.webFiltersTitle)
    }
  }
}
