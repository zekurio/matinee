import MatineeCore
import MatineeKit
import SwiftUI

/*
 * RequestSheet.kt, after the web's request-dialog.tsx and ask-sheet.tsx:
 * where an ask that needs a choice is made, in a sheet from the bottom,
 * where the thumb is. A show's seasons, each the viewer may still ask for
 * with a box, the server's pick already ticked (or only the season a card
 * asked for), the rest with their state; on a first ask "New seasons as
 * they air"; what the server says when asking is off or the requests are
 * used up; and the button, which says what pressing it asks for. Where the
 * ask lands is the server's call. The choosing is MatineeCore's
 * `RequestChooser`, the asking `RequestsHub.ask`.
 */

struct RequestSheet: View {
  let model: RequestSheetModel
  @State private var chooser: RequestChooser
  @Environment(\.requests) private var hub
  @Environment(\.user) private var user
  @Environment(\.sheetDismiss) private var dismiss
  @Environment(\.palette) private var palette

  init(model: RequestSheetModel) {
    self.model = model
    // Made for each opening, so each starts from the server's pick.
    _chooser = State(
      initialValue: RequestChooser(
        ref: model.ref, seasons: requestSeasonsInOrder(model.seasons), first: model.first,
        defaultFuture: model.defaultFuture, libraryId: model.libraryId, only: model.only))
  }

  var body: some View {
    let availability = hub?.availability(model.ref, model.availability) ?? model.availability
    let permission = RequestPermission(availability)
    let show = model.ref.kind == TitleKind.show
    let busy = hub?.busy.contains(model.ref.requestKey) == true
    ScrollView {
      VStack(alignment: .leading, spacing: Space.s3) {
        Text(Str.webAskDialogTitle(model.name))
          .textStyle(.lg, weight: .semibold, tracking: .tight)
          .foregroundStyle(palette.foreground)
          .lineLimit(2)
          .accessibilityAddTraits(.isHeader)
        if show {
          seasons
          if chooser.first {
            Separator()
            MatineeKit.SwitchRow(
              Str.webAskChooserFuture, isOn: Binding(get: { chooser.future }, set: { chooser.setFuture($0) })
            )
            .padding(.horizontal, -Space.s4)
          }
        }
        if let blocked = permission.blocked {
          let why = requestDimmedText(availability, admin: user?.isAdmin == true)
          Callout(
            why?.text ?? requestBlockedText(blocked, admin: user?.isAdmin == true), description: why?.note,
            icon: .circleSlash)
        }
        MatineeButton(
          requestChooserText(chooser.label), look: .primary,
          dimmed: !chooser.canSubmit(availability: availability, busy: false), pending: busy, fullWidth: true
        ) {
          guard chooser.canSubmit(availability: availability, busy: busy), let hub else { return }
          Task {
            if await hub.ask(chooser, name: model.name, availability: availability) { dismiss() }
          }
        }
        .padding(.top, Space.s1)
        if let left = permission.leftToSay(asks: availability.asks || chooser.seasons.contains { $0.availability.asks }) {
          Text(Str.webAskLeft(left)).textStyle(.px13).foregroundStyle(palette.mutedForeground)
            .frame(maxWidth: .infinity)
        }
      }
      .padding(.horizontal, Space.s5)
      .padding(.top, Space.s2)
      .padding(.bottom, Space.s5)
    }
    .scrollBounceBehavior(.basedOnSize)
  }

  private var seasons: some View {
    let live = hub?.seasons(model.ref, chooser.seasons) ?? chooser.seasons
    return VStack(spacing: 0) {
      ForEach(live, id: \.number) { season in
        SeasonChoice(
          show: model.ref, season: season, checked: chooser.picked.contains(season.number)
        ) { chooser.toggle(season.number) }
      }
    }
  }
}

/// One season in the sheet: its box while it can be asked for, its poster,
/// its name, and its episodes, or the state it's in.
private struct SeasonChoice: View {
  let show: CatalogRef
  let season: CatalogSeason
  let checked: Bool
  let toggle: () -> Void
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette

  var body: some View {
    let open = season.availability.asks
    let name = seasonName(season.number)
    let detail =
      open
      ? requestSeasonDetailText(requestSeasonDetail(season, today: todayDay()))
      : season.availability.stateWord(today: todayDay(), percent: false).map(requestStateText)
        ?? Str.webAskChooserUnavailable
    let row = HStack(spacing: Space.s3) {
      // In the room a missing box keeps, so the posters line up.
      Group {
        if open {
          Checkbox(isOn: .constant(checked), label: name).allowsHitTesting(false)
        } else {
          Color.clear
        }
      }
      .frame(width: 20, height: 20)
      .accessibilityHidden(true)
      ArtFrame("\(show.requestKey):\(season.number)", aspect: 2 / 3) {
        Picture(api?.art(season.poster))
      }
      .frame(width: 28)
      .accessibilityHidden(true)
      Text(name)
        .textStyle(.base, weight: .medium)
        .foregroundStyle(open ? palette.foreground : palette.mutedForeground)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      Text(detail).textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(1)
    }
    .padding(.vertical, Space.s1)
    .frame(minHeight: 52)
    .contentShape(Rectangle())
    if open {
      Pressable(shape: .kit(Radius.md), action: { withMotion(Motion.color, toggle) }) { row }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name), \(detail)")
        .accessibilityAddTraits(checked ? [.isSelected, .isToggle] : .isToggle)
    } else {
      row.accessibilityElement(children: .combine)
    }
  }
}
