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
 * with Add at a waiting one's end and Retry at one that needs attention;
 * a tap opens its menu with the rest: Decline with a reason, Give up on an
 * accepted one, and on a declined one in Done, Allow requests again and
 * Add after all. Add all leads Waiting when more than one waits. Every
 * answer leaves the list at once and goes once the toast's Undo has
 * passed (MatineeCore's `RequestAdminQueue`); Retry goes at once. Done
 * comes a page at a time from its own call, as Android's. Removing a
 * request, searching Done, and "Goes to" are left to the web.
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
  @Environment(\.requests) private var hub

  var body: some View {
    MatineeButton(Str.webRequestsDecline, look: .ghost, size: .touch) { hub?.declining = item }
  }
}

/// Decline, with why: the reason, picked as a sheet's choices are, and a
/// note for whoever asked, as Android's `DeclineSheet`. The reasons are
/// the contract's for a waiting request. With `giveUp`, the same sheet
/// gives up on an accepted request, its reason fixed as "Can't find a copy".
struct DeclineSheet: View {
  let item: AdminRequestItem
  var giveUp = false
  @State private var reason: String?
  @State private var note = ""
  @Environment(\.requests) private var hub
  @Environment(\.sheetDismiss) private var dismiss
  @Environment(\.palette) private var palette

  var body: some View {
    let askedBy = item.followers.map(\.name)
    SheetHeader(giveUp ? Str.webRequestsGiveUpTitle(item.title.name) : Str.webRequestsDeclineTitle(item.title.name))
    SheetBody(sides: Space.sheet, top: Space.s4, bottom: Space.s4, spacing: Space.s4) {
      VStack(alignment: .leading, spacing: Space.s1) {
        Text(Str.webRequestsDeclineReason).textStyle(.sm, weight: .medium).foregroundStyle(palette.mutedForeground)
        VStack(spacing: 0) {
          if giveUp {
            // Only one reason fits giving up, so it's said, not offered.
            ReasonRow(label: requestReasonLabel(DeclineReason.notFound), selected: true) {}
          } else {
            ForEach(WaitingDeclineReason.knownValues, id: \.self) { code in
              ReasonRow(label: requestReasonLabel(code), selected: reason == code) { reason = code }
            }
          }
        }
        .padding(.horizontal, -Space.sheet)
      }
      FormField(askedBy.isEmpty ? Str.webRequestsDeclineNote : Str.webRequestsDeclineNoteFor(requestNames(askedBy))) {
        MatineeTextField(Str.webRequestsDeclineNotePlaceholder, text: $note)
      }
      if giveUp {
        // A by-hand connection holds nothing to keep.
        Text(item.connection.flatMap { $0.reportsProgress ? Str.webRequestsGiveUpKeeps($0.name) : nil } ?? Str.webRequestsGiveUpTurnsUp)
          .textStyle(.px13).foregroundStyle(palette.mutedForeground)
      }
    }
    // The button stays in reach, above the keyboard while the note is typed.
    SheetFooter {
      MatineeButton(
        giveUp ? Str.webRequestsGiveUpSubmit : Str.webRequestsDeclineSubmit, look: .primary, dimmed: !giveUp && reason == nil,
        fullWidth: true
      ) {
        guard let hub else { return }
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let note = text.isEmpty ? nil : text
        let item = item
        if giveUp {
          dismiss { hub.answer(item, .giveUp(note: note)) }
        } else {
          guard let reason else { return }
          dismiss { hub.answer(item, .decline(reason: reason, note: note)) }
        }
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
/// live from the stream the whole app follows, Done a page at a time.
struct RequestsScreen: View {
  let start: String?
  @State private var list: RequestQueueList
  @State private var menu: AdminRequestItem?
  @State private var givingUp: AdminRequestItem?
  /// Done, read page by page from its own call, as the stream carries only its newest.
  @State private var done = RequestPages<AdminRequestItem> { $0.id }
  @State private var doneConfigured = false
  @Environment(\.requests) private var hub
  @Environment(\.api) private var api
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
    .matineeSheet(item: $menu) { item in
      RowMenu(item: item, list: list, onGiveUp: { givingUp = $0 }) { id in done.remove { $0.id == id } }
    }
    .background {
      Color.clear.matineeSheet(item: $givingUp) { item in DeclineSheet(item: item, giveUp: true) }
    }
    .onAppear(perform: configureDone)
    .onChange(of: list) { configureDone() }
    #if DEBUG
      // `-requests.open add|decline|menu|addAll|retry|giveUp|allowAgain|addAfterAll`: the first row's
      // action, Add all, or the menu, once it's up, for a screenshot.
      .task(id: hub?.queue.queue == nil || list == .done && done.items.isEmpty) {
        guard let hub, hub.queue.queue != nil, let what = UserDefaults.standard.string(forKey: "requests.open"),
          let first = rows(hub).first
        else { return }
        try? await Task.sleep(for: .seconds(1.5))
        switch what {
        case "add": hub.answer(first, .add)
        case "decline": hub.declining = first
        case "menu": menu = first
        case "addAll": if let all = hub.queue.addsAll { hub.answerAll(all) }
        case "retry": hub.retry(first)
        case "giveUp": givingUp = first
        case "allowAgain", "addAfterAll":
          guard let declined = rows(hub).first(where: { $0.status == RequestStatus.declined }) else { return }
          hub.answer(declined, what == "allowAgain" ? .allowAgain : .addAfterAll) { done.remove { $0.id == declined.id } }
        default: break
        }
      }
    #endif
  }

  /// The rows of the list showing, less the ones held for Undo.
  private func rows(_ hub: RequestsHub) -> [AdminRequestItem] {
    list == .done ? hub.queue.unheld(done.items) : hub.queue.rows(list)
  }

  private func content(_ hub: RequestsHub) -> some View {
    let rows = rows(hub)
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
        if list == .done, done.items.isEmpty, let failure = done.failure {
          ErrorState(
            Str.requestsLoadFailed, describeFailure(failure), disconnected: failure.isDisconnect, retrying: done.loading,
            onRetry: done.more
          )
          .frame(maxWidth: .infinity)
          .padding(.vertical, Space.s12)
        } else if list == .done, done.items.isEmpty, done.loading || done.nextPage != nil {
          Spinner(size: 32, tint: palette.accent).frame(maxWidth: .infinity).padding(.vertical, Space.s16)
        } else if rows.isEmpty {
          EmptyState(icon: .inbox, title: emptyTitle).padding(.vertical, Space.s12).frame(maxWidth: .infinity)
        } else {
          if list == .waiting, let all = hub.queue.addsAll {
            MatineeButton(Str.webRequestsAddAll(all.count), icon: .listChecks, look: .outline, fullWidth: true) {
              hub.answerAll(all)
            }
            .padding(.horizontal, gutter)
          }
          LazyVStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
              if index > 0 { Separator() }
              QueueRow(item: item, list: list) { menu = item }
            }
            if list == .done, done.nextPage != nil {
              DoneEnd(failed: done.failure != nil, onMore: done.more)
            }
          }
          .padding(.horizontal, gutter)
          .animation(Motion.move, value: rows.map(\.id))
        }
      }
      .padding(.bottom, Space.s8)
    }
  }

  /// Reads Done's first page once the list shows, from the request screens' API.
  private func configureDone() {
    guard list == .done, !doneConfigured, let api else { return }
    doneConfigured = true
    let data = RequestData(api: api), cursors = RequestCursors()
    done.configure(key: "done") { page in try await data.doneBatch(page: page, cursors: cursors) }
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

/// The end of Done while more of it is to come: a spinner that asks for the
/// next page as it shows, or the failure with Retry.
private struct DoneEnd: View {
  let failed: Bool
  let onMore: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      if failed {
        ErrorSection(Str.listMoreFailed, nil, onRetry: onMore)
      } else {
        Spinner(size: 24, tint: palette.accent).onAppear(perform: onMore)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, Space.s4)
  }
}

/// A request in the queue, as Downloads lists files: the poster, then the
/// title and what it is, then who asked and where it goes, or how it
/// stands; Add at a waiting one's end, Retry at one that needs attention.
/// A tap opens its menu.
private struct QueueRow: View {
  let item: AdminRequestItem
  let list: RequestQueueList
  let onMenu: () -> Void
  @Environment(\.api) private var api
  @Environment(\.requests) private var hub
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
      switch requestQueueRowAction(list) {
      case .add:
        AddButton(item: item, size: .md).fixedSize()
      case .retry:
        RoundIconButton(
          .rotateCw, label: Str.webRequestsRetryNamed(item.title.name), look: .ghost, size: 40, iconSize: 18,
          tint: palette.mutedForeground
        ) { hub?.retry(item) }
      default:
        EmptyView()
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

/// A row's menu: what the list allows (MatineeCore's `requestQueueActions`), and its title's page.
private struct RowMenu: View {
  let item: AdminRequestItem
  let list: RequestQueueList
  /// Opens the give-up sheet, once this one has gone.
  let onGiveUp: (AdminRequestItem) -> Void
  /// A declined request in Done was answered: its row leaves Done, which is read page by page.
  let onAnswered: (String) -> Void
  @Environment(\.requests) private var hub
  @Environment(\.navigator) private var nav

  var body: some View {
    SheetBody(bottom: Space.s2) {
      SheetHeader(item.title.name, subtitle: [item.library.name, item.connection?.name ?? Str.webRequestsNoConnection].joined(separator: " · "))
      if hub?.queue.canAnswer(item) == true {
        ForEach(requestQueueActions(item, in: list), id: \.self, content: entry)
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

  @ViewBuilder private func entry(_ action: RequestQueueAction) -> some View {
    let id = item.id
    switch action {
    case .add: SheetItem(Str.webRequestsAdd, icon: .check) { hub?.answer(item, .add) }
    case .decline: SheetItem(Str.webRequestsDecline, icon: .x) { hub?.declining = item }
    case .retry: SheetItem(Str.webRequestsRetry, icon: .rotateCw) { hub?.retry(item) }
    case .giveUp: SheetItem(Str.webRequestsGiveUp, icon: .circleSlash) { onGiveUp(item) }
    case .addAfterAll:
      SheetItem(Str.webRequestsAddAfterAll, icon: .check) { hub?.answer(item, .addAfterAll) { onAnswered(id) } }
    case .allowAgain:
      SheetItem(Str.webRequestsAllowAgain, icon: .lockOpen) { hub?.answer(item, .allowAgain) { onAnswered(id) } }
    }
  }
}

/// What the toast says while an answer waits out its Undo.
func requestAnsweredText(_ answer: RequestAdminAnswer, _ name: String) -> String {
  switch answer {
  case .add: Str.webRequestsToastAdded(name)
  case .decline: Str.webRequestsToastDeclined(name)
  case .giveUp: Str.webRequestsToastGaveUp(name)
  case .allowAgain: Str.webRequestsToastAllowedAgain(name)
  case .addAfterAll: Str.webRequestsToastAddedAfterAll(name)
  }
}

/// What the toast says when the server didn't take an answer.
func requestAnswerFailedText(_ answer: RequestAdminAnswer, _ name: String) -> String {
  switch answer {
  case .add: Str.webRequestsToastAddFailed
  case .decline: Str.webRequestsToastDeclineFailed(name)
  case .giveUp: Str.webRequestsToastGiveUpFailed(name)
  case .allowAgain: Str.webRequestsToastAllowAgainFailed(name)
  case .addAfterAll: Str.webRequestsToastAddAfterAllFailed(name)
  }
}
