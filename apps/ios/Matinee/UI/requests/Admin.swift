import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Admin.kt, after the web's requests.tsx: an admin's side of requests on
 * a phone. The way in is the profile's inbox, with a dot while requests
 * wait; Add and Decline sit on a waiting title's page where Request does,
 * with who asked behind a tap on the poster's state; and the queue, a list
 * behind the profile, of the web's four lists. A row is the poster, the
 * title and what it is, who asked and where it goes, or how it stands,
 * with Add at a waiting one's end; a tap opens its menu. Add and Decline
 * leave the list at once and go once the toast's Undo has passed
 * (MatineeCore's `RequestAdminQueue`). Retry, Give up, Add all, and a
 * declined request's Allow again and Add after all are Android's too;
 * here they're left to the web for now, as is removing a request.
 */

/// An admin's Add for a waiting request, where everyone else's Request sits and in its style.
struct AddButton: View {
  let item: AdminRequestItem
  var fullWidth = false
  var size: ButtonSize = .touch
  @Environment(\.requests) private var hub

  var body: some View {
    MatineeButton(Str.webRequestsAdd, icon: .check, look: .primary, size: size, fullWidth: fullWidth) {
      hub?.answer(item, .add)
    }
    .accessibilityLabel(Str.webRequestsAddNamed(item.title.name))
  }
}

/// The quiet button beside `AddButton`, opening the Decline sheet.
struct DeclineButton: View {
  let item: AdminRequestItem
  var size: ButtonSize = .touch
  @Environment(\.requests) private var hub

  var body: some View {
    MatineeButton(Str.webRequestsDecline, look: .ghost, size: size) { hub?.declining = item }
  }
}

/// Decline, with why: the reason, picked as a sheet's choices are, and a
/// note for whoever asked, as Android's `DeclineSheet`. The reasons are
/// the contract's for a waiting request.
struct DeclineSheet: View {
  let item: AdminRequestItem
  @State private var reason: String?
  @State private var note = ""
  @Environment(\.requests) private var hub
  @Environment(\.sheetDismiss) private var dismiss
  @Environment(\.palette) private var palette

  var body: some View {
    let askedBy = item.followers.map(\.name)
    SheetHeader(Str.webRequestsDeclineTitle(item.title.name))
    SheetBody(sides: Space.sheet, top: Space.s4, bottom: Space.s4, spacing: Space.s4) {
      VStack(alignment: .leading, spacing: Space.s1) {
        Text(Str.webRequestsDeclineReason).textStyle(.sm, weight: .medium).foregroundStyle(palette.mutedForeground)
        VStack(spacing: 0) {
          ForEach(WaitingDeclineReason.knownValues, id: \.self) { code in
            ReasonRow(label: requestReasonLabel(code), selected: reason == code) { reason = code }
          }
        }
        .padding(.horizontal, -Space.sheet)
      }
      FormField(askedBy.isEmpty ? Str.webRequestsDeclineNote : Str.webRequestsDeclineNoteFor(requestNames(askedBy))) {
        MatineeTextField(Str.webRequestsDeclineNotePlaceholder, text: $note)
      }
    }
    // The button stays in reach, above the keyboard while the note is typed.
    SheetFooter {
      MatineeButton(Str.webRequestsDeclineSubmit, look: .primary, dimmed: reason == nil, fullWidth: true) {
        guard let reason, let hub else { return }
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let item = item
        dismiss { hub.answer(item, .decline(reason: reason, note: text.isEmpty ? nil : text)) }
      }
    }
  }
}

/// A reason to pick, as the web Drawer's choice row: the name, and the accent's check on the one picked.
private struct ReasonRow: View {
  let label: String
  let selected: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Pressable(shape: Rectangle(), action: action) {
      HStack(spacing: Space.s4) {
        Text(label).textStyle(.base).foregroundStyle(palette.foreground).frame(maxWidth: .infinity, alignment: .leading)
        if selected { LucideIcon(.check, size: 18, tint: palette.accent) }
      }
      .padding(.horizontal, Space.sheet)
      .frame(minHeight: 48)
      .contentShape(Rectangle())
    }
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

// MARK: The queue

/// The admin's requests: Waiting, Needs attention, On the way, and Done,
/// live from the stream the whole app follows.
struct RequestsScreen: View {
  let start: String?
  @State private var list: RequestQueueList
  @State private var menu: AdminRequestItem?
  @Environment(\.requests) private var hub
  @Environment(\.user) private var user
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  init(start: String?) {
    self.start = start
    _list = State(initialValue: start.flatMap(RequestQueueList.init(rawValue:)) ?? .waiting)
  }

  var body: some View {
    Group {
      if let hub, user?.isAdmin == true {
        if hub.queue.queue == nil {
          LoadingBox()
        } else {
          content(hub)
        }
      } else {
        EmptyState(icon: .inbox, title: Str.webRequestsEmptyWaiting)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .topBar(Str.webRequestsTitle)
    .matineeSheet(item: $menu) { item in RowMenu(item: item, list: list) }
    #if DEBUG
      // `-requests.open add|decline|menu`: the first row's Add, Decline, or menu, once it's up, for a screenshot.
      .task(id: hub?.queue.queue == nil) {
        guard let hub, hub.queue.queue != nil, let what = UserDefaults.standard.string(forKey: "requests.open"),
          let first = hub.queue.rows(list).first
        else { return }
        try? await Task.sleep(for: .seconds(1.5))
        switch what {
        case "add": hub.answer(first, .add)
        case "decline": hub.declining = first
        case "menu": menu = first
        default: break
        }
      }
    #endif
  }

  private func content(_ hub: RequestsHub) -> some View {
    let rows = hub.queue.rows(list)
    return ScrollView {
      VStack(alignment: .leading, spacing: Space.s3) {
        ScrollView(.horizontal) {
          HStack(spacing: Space.s2) {
            ForEach(RequestQueueList.allCases, id: \.self) { key in
              let count = hub.queue.count(key) ?? 0
              let label = requestListLabel(key)
              Chip(count > 0 ? "\(label) \(formatCount(count))" : label, selected: list == key) {
                withMotion(Motion.color) { list = key }
              }
            }
          }
        }
        .contentMargins(.horizontal, gutter, for: .scrollContent)
        .scrollIndicators(.hidden)
        if rows.isEmpty {
          EmptyState(icon: .inbox, title: emptyTitle).padding(.vertical, Space.s12).frame(maxWidth: .infinity)
        } else {
          LazyVStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
              if index > 0 { Separator() }
              QueueRow(item: item, list: list) { menu = item }
            }
          }
          .padding(.horizontal, gutter)
          .animation(Motion.move, value: rows.map(\.id))
        }
      }
      .padding(.bottom, Space.s8)
    }
  }

  private var emptyTitle: String {
    switch list {
    case .waiting: Str.webRequestsEmptyWaiting
    case .needsAttention: Str.webRequestsEmptyNeedsAttention
    case .onTheWay: Str.webRequestsEmptyOnTheWay
    case .done: Str.webRequestsEmptyDone
    }
  }
}

/// A request in the queue, as Downloads lists files: the poster, then the
/// title and what it is, then who asked and where it goes, or how it
/// stands; Add at a waiting one's end. A tap opens its menu.
private struct QueueRow: View {
  let item: AdminRequestItem
  let list: RequestQueueList
  let onMenu: () -> Void
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    let layout =
      dynamicType.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: Space.s2))
      : AnyLayout(HStackLayout(spacing: Space.s3_5))
    layout {
      Pressable(shape: .kit(Radius.md), wash: true, action: onMenu) {
        HStack(alignment: .center, spacing: Space.s3_5) {
          // Too small for the name on its tone: the art alone, as a list's thumbnail.
          ArtFrame(item.title.ref.requestKey, aspect: 2 / 3) { Picture(api?.art(item.title.poster)) }
            .frame(width: 44)
          VStack(alignment: .leading, spacing: 2) {
            Text(item.title.name).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground).lineLimit(2)
            Text(
              [requestYearKind(item.title.year, item.title.ref.kind), requestScopeText(item.scope)].compactMap(\.self)
                .joined(separator: " · ")
            )
            .textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(dynamicType.isAccessibilitySize ? 2 : 1)
            status
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .multilineTextAlignment(.leading)
        }
        .padding(.vertical, Space.s2)
        .contentShape(Rectangle())
      }
      .accessibilityElement(children: .combine)
      .accessibilityHint(Str.webRequestsMore(item.title.name))
      if list == .waiting {
        AddButton(item: item, size: .md).fixedSize()
      }
    }
  }

  @ViewBuilder private var status: some View {
    switch list {
    case .waiting:
      let (first, rest) = requestAskers(item)
      if let first {
        let who = [
          rest.isEmpty ? first.name : "\(first.name) \(Str.webRequestsOthersCount(String(rest.count)))",
          relativeTime(first.createdAt), item.library.name,
        ]
        HStack(spacing: Space.s1_5) {
          ProfileAvatar(first.name, url: first.avatarId.flatMap { api?.paths.avatar($0) }, size: 16)
          Text(who.joined(separator: " · ")).textStyle(.px13).foregroundStyle(palette.foreground.opacity(0.85))
            .lineLimit(1)
        }
      }
      if item.connection == nil {
        Text(Str.webRequestsNoConnection).textStyle(.px13).foregroundStyle(palette.destructive).lineLimit(1)
      }
    case .needsAttention:
      Text(item.error ?? Str.webRequestsAttentionUnknown).textStyle(.px13).foregroundStyle(palette.destructive)
        .lineLimit(2)
    case .onTheWay:
      let progress = requestProgress(item)
      if case .share(let share, _) = progress {
        ProgressBar(share, height: 3).padding(.vertical, 3)
      }
      Text([requestProgressText(progress), item.library.name].joined(separator: " · "))
        .textStyle(.px13).foregroundStyle(palette.foreground.opacity(0.85)).lineLimit(1)
    case .done:
      let outcome = requestOutcomeText(requestOutcome(item))
      if !outcome.isEmpty {
        Text(outcome).textStyle(.px13).foregroundStyle(palette.foreground.opacity(0.85)).lineLimit(1)
      }
      if let note = item.note {
        Text(note).textStyle(.px13).italic().foregroundStyle(palette.mutedForeground).lineLimit(1)
      }
    }
  }
}

/// A row's menu: what the list allows, and its title's page.
private struct RowMenu: View {
  let item: AdminRequestItem
  let list: RequestQueueList
  @Environment(\.requests) private var hub
  @Environment(\.navigator) private var nav

  var body: some View {
    SheetBody(bottom: Space.s2) {
      SheetHeader(item.title.name, subtitle: [item.library.name, item.connection?.name ?? Str.webRequestsNoConnection].joined(separator: " · "))
      if list == .waiting, hub?.queue.canAnswer(item) == true {
        SheetItem(Str.webRequestsAdd, icon: .check) { hub?.answer(item, .add) }
        SheetItem(Str.webRequestsDecline, icon: .x) { hub?.declining = item }
      }
      SheetItem(Str.webRequestsOpenTitle, icon: .info) {
        if let here = item.availability.libraryTitleId {
          nav.titleId(here)
        } else {
          nav.catalog(item.title.ref, item.library.id)
        }
      }
    }
  }
}
