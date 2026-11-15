import MatineeCore
import MatineeKit
import SwiftUI

/*
 * LibrariesSettings.kt: the libraries, the editor for one, and the
 * server's folders to pick its folders from, as the web's libraries panel,
 * library dialog, and folder browser. What a row says, the draft, and the
 * picker's bar are MatineeCore's (Admin/LibraryForms.swift).
 *
 * The server has no stream for a library's scan; while one runs, or a
 * metadata fetch, the list asks again every two seconds, as the web's.
 */

/// How often the list asks again while a scan or a fetch runs.
private let BUSY_POLL: Duration = .seconds(2)

/// The libraries: each with its titles and what the server is doing to it.
/// A tap offers scanning it, fetching its metadata again, editing it, or
/// removing it, which asks first; Add library opens the same editor empty.
struct LibrariesSettings: View {
  var body: some View { LibrariesPage().adminTheme() }
}

private struct LibrariesPage: View {
  @State private var loader = Loader<[Library]>()
  @State private var providers = Loader<[MetadataProvider]>()
  @State private var saver = Saver()
  @State private var acting: Picked<Library>?
  @State private var confirmation: Confirmation?
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  // TODO(shell): the kit's toasts, once the shell hosts them.
  @Environment(\.snackbar) private var snackbar
  @Environment(ShellNav.self) private var shell: ShellNav?
  @Environment(\.adminPalette) private var palette

  var body: some View {
    let busy = librariesBusy(loader.state.value ?? [])
    AdminPage(Str.settingsAdminLibraries) {
      AdminLoaded(loader) { list in
        VStack(alignment: .leading, spacing: Space.s3) {
          Text(Str.webLibrariesTitle).textStyle(.base, weight: .semibold, tracking: .tight)
            .accessibilityAddTraits(.isHeader)
          if list.isEmpty {
            MatineeKit.EmptyState(title: Str.webLibrariesEmptyTitle, description: Str.webLibrariesEmptyDescription) {
              addButton
            }
            .overlay {
              RoundedRectangle.kit(Radius.xl).strokeBorder(palette.border, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
          } else {
            // Over the list, full width, as the web puts its action on a phone.
            addButton
            ListBlock {
              ForEach(list, id: \.id) { library in
                LibraryRow(library: library, state: libraryState(library, providers: providers.state.value)) {
                  acting = Picked(library.id, library)
                }
              }
            }
          }
        }
      }
    }
    // Back from the editor, the list shows what it saved.
    .loads(loader, maxAge: .zero) { api in try await api.libraries.list() }
    .loads(providers) { api in try await api.metadata.providers() }
    // The editor says when it saved: going back by its button doesn't always show this page anew.
    .onChange(of: shell?.results.peek(LIBRARY_SAVED), initial: true) {
      if shell?.results.take(LIBRARY_SAVED) != nil { loader.reload() }
    }
    .task(id: busy) {
      while busy, !Task.isCancelled {
        try? await Task.sleep(for: BUSY_POLL)
        if !Task.isCancelled { loader.reload() }
      }
    }
    .onChange(of: loader.state.value?.first?.id, initial: true) { _, _ in
      guard let list = loader.state.value, let first = list.first, acting == nil, confirmation == nil else { return }
      if adminDemo("sheet") { acting = Picked(first.id, first) }
      // Removing asks for the library by name, and only acts on that one.
      guard let target = adminDemoTarget().flatMap({ name in list.first { $0.name == name } }) else { return }
      if adminDemo("remove") { askRemove(target) }
      if adminDemoOnce("remove-yes") {
        askRemove(target)
        confirmation?.action()
        confirmation = nil
      }
    }
    .matineeSheet(item: $acting) { picked in
      LibrarySheet(
        library: picked.value, onScan: { scan(picked.value) }, onRefresh: { refresh(picked.value) },
        onEdit: { nav.libraryEditor(picked.value.id) }, onRemove: { askRemove(picked.value) })
    }
    .confirming($confirmation)
  }

  private var addButton: some View {
    MatineeKit.MatineeButton(Str.webLibrariesAdd, icon: .plus, fullWidth: true) { nav.libraryEditor(nil) }
  }

  private func scan(_ library: Library) {
    guard let api else { return }
    saver(snackbar) {
      try await api.libraries.scan(id: library.id)
      loader.reload()
    }
  }

  private func refresh(_ library: Library) {
    guard let api else { return }
    saver(snackbar) {
      try await api.libraries.refreshMetadata(id: library.id)
      snackbar.show(Str.webLibrariesFetching)
      loader.reload()
    }
  }

  private func askRemove(_ library: Library) {
    confirmation = Confirmation(
      title: Str.webLibrariesRemoveTitle(library.name), message: Str.webLibrariesRemoveDescription,
      confirm: Str.webLibrariesRemoveConfirm
    ) {
      guard let api else { return }
      saver(snackbar) {
        try await api.libraries.remove(id: library.id)
        snackbar.show(Str.webLibrariesRemoved(library.name))
        loader.reload()
      }
    }
  }
}

/// A library: its kind's icon on a tile, its name, and what it holds or what
/// the server is doing to it, with a spinner while that runs.
private struct LibraryRow: View {
  let library: Library
  let state: LibraryState
  let onOpen: () -> Void
  @Environment(\.adminPalette) private var palette

  var body: some View {
    let busy = state == .scanning || library.refreshing
    MatineeKit.ListRow(
      library.name, subtitle: status, icon: library.kind == LibraryKind.shows ? .tv : .film, iconTile: true,
      accessory: MatineeKit.ListRowAccessory.none, action: onOpen
    ) {
      if busy { Spinner(size: 16, tint: palette.accent) }
      MatineeKit.LucideIcon(.ellipsis, size: 18, tint: palette.mutedForeground)
    }
    .accessibilityHint(Str.webLibrariesActions(library.name))
  }

  private var status: String {
    switch state {
    case .scanning: Str.webLibrariesScanning
    case .fetching(let provider?): Str.webLibrariesFetchingFrom(provider)
    case .fetching(nil): Str.webLibrariesFetchingFromProvider
    case .idle(let titles, let provider):
      [Str.browseTitleCount(titles), provider].compactMap { $0 }.joined(separator: " · ")
    }
  }
}

/// What can be done to a library, under its folders.
private struct LibrarySheet: View {
  let library: Library
  let onScan: () -> Void
  let onRefresh: () -> Void
  let onEdit: () -> Void
  let onRemove: () -> Void

  var body: some View {
    MatineeKit.SheetHeader(library.name, subtitle: library.paths.joined(separator: ", "))
    MatineeKit.SheetItem(Str.webLibrariesScanNow, icon: .refreshCw, action: onScan)
    if library.metadataProvider != nil {
      MatineeKit.SheetItem(Str.webLibrariesRefreshMetadata, icon: .image, action: onRefresh)
    }
    MatineeKit.SheetItem(Str.webLibrariesEdit, icon: .settings, action: onEdit)
    MatineeKit.SheetItem(Str.webLibrariesRemove, icon: .trash, destructive: true, action: onRemove)
  }
}

/// The key the folder picker leaves its folder under.
let PICKED_FOLDER = "picked_folder"

/// The key the library editor leaves the library it saved under, for the list to show it.
private let LIBRARY_SAVED = "library_saved"

/// An admin adding a library, or with `id`, changing one: the library's
/// name, kind, metadata, and folders, as a page of its own. Folders are
/// picked on the next page, which hands the folder back through `results`,
/// under `PICKED_FOLDER`, as Android's `savedStateHandle`:
/// `nav.backWith(PICKED_FOLDER, folder)`. The draft lives on this page,
/// which stays on the stack under the picker.
struct LibraryEditorScreen: View {
  let id: String?
  let results: NavResults

  var body: some View { LibraryEditorLoading(id: id, results: results).adminTheme() }
}

private struct LibraryEditorLoading: View {
  let id: String?
  let results: NavResults
  @State private var libraries = Loader<[Library]>()
  @State private var providers = Loader<[MetadataProvider]>()

  var body: some View {
    let list = libraries.state.value
    let existing = id.flatMap { id in list?.first { $0.id == id } }
    let title = id == nil ? Str.webLibrariesDialogAddTitle : Str.webLibrariesDialogEditTitle
    // The draft starts from the library and the providers, so it waits for both.
    let ready = !providers.state.isLoading && (id == nil || existing != nil || libraries.state.isFailed)
    Group {
      if ready {
        LibraryEditor(
          title: title, existing: existing, providers: providers.state.value ?? [],
          knownPath: list?.first?.paths.first, results: results)
      } else {
        AdminPage(title) { AdminLoaded(providers) { _ in EmptyView() } }
      }
    }
    .loads(libraries) { api in try await api.libraries.list() }
    .loads(providers) { api in try await api.metadata.providers() }
  }
}

private struct LibraryEditor: View {
  let title: String
  let existing: Library?
  let providers: [MetadataProvider]
  let knownPath: String?
  let results: NavResults
  @State private var draft: LibraryDraft
  @State private var saver = Saver()
  @FocusState private var naming: Bool
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  // TODO(shell): the kit's toasts, once the shell hosts them.
  @Environment(\.snackbar) private var snackbar
  @Environment(\.adminPalette) private var palette

  init(title: String, existing: Library?, providers: [MetadataProvider], knownPath: String?, results: NavResults) {
    self.title = title
    self.existing = existing
    self.providers = providers
    self.knownPath = knownPath
    self.results = results
    _draft = State(
      initialValue: LibraryDraft(
        existing: existing, providers: providers, deviceLanguage: Locale.app.language.languageCode?.identifier))
  }

  var body: some View {
    AdminPage(title) {
      MatineeKit.MatineeButton(
        existing == nil ? Str.webLibrariesBrowserAdd : Str.webLibrariesDialogSave, size: .md, pending: saver.saving,
        action: save
      )
      .disabled(!draft.valid)
      .padding(.trailing, Space.s3)
    } content: {
      details
      folders
    }
    // The folder the picker handed back, added once, as this page shows again.
    .onChange(of: results.peek(PICKED_FOLDER), initial: true) {
      if let picked = results.take(PICKED_FOLDER) {
        MatineeKit.withMotion(MatineeKit.Motion.enter) { draft.add(picked) }
      }
    }
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: Space.s3) {
      ListBlock {
        InputRow(Str.webLibrariesDialogName, text: $draft.name, placeholder: Str.webLibrariesDialogNamePlaceholder)
          .focused($naming)
          .submitLabel(.done)
          .onSubmit { naming = false }
        SelectRow(
          Str.webLibrariesDialogType, selection: $draft.kind,
          options: [
            (LibraryKind.movies, Str.webLibrariesDialogKindMovies), (LibraryKind.shows, Str.webLibrariesDialogKindShows),
          ])
        SelectRow(
          Str.webLibrariesDialogMetadata,
          selection: Binding(get: { draft.provider }, set: { draft.pick(provider: $0, from: providers) }),
          options: [(nil as String?, Str.webLibrariesDialogNoProvider)]
            + providers.map { ($0.id, $0.configured ? $0.name : "\($0.name) · \(Str.webLibrariesDialogNeedsKey)") })
        if draft.provider != nil {
          SelectRow(
            Str.webLibrariesDialogLanguage, selection: $draft.language,
            options: offeredMetadataLanguages(draft.language).map { ($0.value, metadataLanguageName($0.tag)) })
        }
      }
      if draft.provider == nil {
        Note(Str.webLibrariesDialogNoProviderHint)
      }
    }
    .adminMotion(MatineeKit.Motion.enter, value: draft.provider == nil)
  }

  private var folders: some View {
    ListSection(Str.webLibrariesDialogFolders) {
      if draft.paths.isEmpty {
        Text(Str.webLibrariesDialogNoFolders).textStyle(.sm).foregroundStyle(palette.mutedForeground)
          .padding(.horizontal, Space.s4)
          .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
      }
      ForEach(draft.paths, id: \.self) { path in
        HStack(spacing: Space.s3) {
          MatineeKit.LucideIcon(.server, size: 18, tint: palette.mutedForeground).frame(width: 24)
          Text(path).textStyle(.sm).foregroundStyle(palette.foreground).lineLimit(2).truncationMode(.middle)
            .frame(maxWidth: .infinity, alignment: .leading)
          MatineeKit.RoundIconButton(
            .x, label: Str.webLibrariesDialogRemoveFolder(path), look: .ghost, size: 32, iconSize: 16,
            tint: palette.mutedForeground
          ) {
            MatineeKit.withMotion(MatineeKit.Motion.exit) { draft.remove(path) }
          }
        }
        .padding(.leading, Space.s4)
        .padding(.trailing, Space.s2)
        .frame(minHeight: 52)
      }
      AdminActionRow(title: Str.webLibrariesDialogAddFolder, icon: .folderPlus) {
        // The name's keyboard would open again over the editor when the picker hands back.
        naming = false
        nav.folderPicker(draft.pickerStart(existing: existing, knownPath: knownPath), draft.paths)
      }
    }
  }

  private func save() {
    guard let api, draft.valid else { return }
    let input = draft.input
    let existing = existing
    saver(snackbar) {
      let saved =
        if let existing {
          try await api.libraries.update(
            id: existing.id, name: input.name, kind: input.kind, paths: input.paths,
            metadataProvider: input.metadataProvider, metadataLanguage: input.metadataLanguage)
        } else {
          try await api.libraries.create(libraryInput: input)
        }
      nav.backWith(LIBRARY_SAVED, saved.id)
    }
  }
}

/// "German" for `de`, "Portuguese (Brazil)" for `pt-BR`, in the app's language.
private func metadataLanguageName(_ tag: String) -> String {
  let locale = Locale.app
  guard let name = locale.localizedString(forIdentifier: tag), !name.isEmpty else { return tag }
  return name.prefix(1).uppercased(with: locale) + name.dropFirst()
}

/// The server's folders, one level at a time, as a page over the editor,
/// opening at `start`, with the folders in `added` marked. A row opens its
/// folder or adds it straight away; the bar at the bottom adds the one
/// that's open. Adding goes back to the editor with the folder.
struct FolderPickerScreen: View {
  let start: String?
  let added: [String]

  var body: some View { FolderPicker(start: start, added: added).adminTheme() }
}

private struct FolderPicker: View {
  let added: [String]
  @State private var path: String?
  @State private var listing: DirectoryListing?
  @State private var failure: (message: String, disconnected: Bool)?
  @State private var attempt = 0
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.adminPalette) private var palette

  init(start: String?, added: [String]) {
    self.added = added
    _path = State(initialValue: start)
  }

  var body: some View {
    let current = listing
    VStack(spacing: 0) {
      // Keyed by the folder, so opening another one shows its path.
      PathField(path: current?.path ?? path ?? "/") { path = $0 }
        .id(current?.path ?? path)
        .padding(.horizontal, Space.gutter)
        .padding(.top, Space.s2)
        .padding(.bottom, Space.s3)
        .frame(maxWidth: ADMIN_COLUMN)
      ZStack {
        if let current {
          ScrollView {
            ListBlock {
              if let parent = current.parent {
                FolderRow(name: "..", up: true, label: Str.webLibrariesBrowserParent) { path = parent }
              }
              if current.directories.isEmpty {
                Text(Str.webLibrariesBrowserEmpty).textStyle(.sm).foregroundStyle(palette.mutedForeground)
                  .padding(.horizontal, Space.s4)
                  .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
              }
              ForEach(current.directories, id: \.path) { directory in
                FolderRow(
                  name: directory.name, label: Str.webLibrariesBrowserOpen(directory.name),
                  onAdd: added.contains(directory.path) ? nil : { add(directory.path) }
                ) { path = directory.path }
              }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, Space.s6)
            .frame(maxWidth: ADMIN_COLUMN)
            .frame(maxWidth: .infinity)
          }
          .scrollDismissesKeyboard(.interactively)
        } else if let failure {
          // TODO(shell): the shared error state.
          ErrorBox(Str.foldersLoadFailed, failure.message, disconnected: failure.disconnected) { attempt += 1 }
        } else {
          Spinner(size: 24, tint: palette.mutedForeground).accessibilityLabel(Str.loadingInProgress)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .frame(maxWidth: .infinity)
    // Always there, so the list above doesn't jump when the first folder loads.
    .safeAreaInset(edge: .bottom, spacing: 0) { bar(current) }
    .topBar(Str.webLibrariesDialogBrowse, leading: .back)
    .task(id: "\(path ?? "")#\(attempt)") { await open(path) }
  }

  private func open(_ folder: String?) async {
    guard let api else { return }
    failure = nil
    do {
      listing = try await api.admin.browse(path: folder)
    } catch {
      let reason = Failure(error)
      if reason == .cancelled { return }
      listing = nil
      failure = (describeFailure(reason), reason.isDisconnect)
    }
  }

  private func add(_ folder: String) { nav.backWith(PICKED_FOLDER, folder) }

  private func bar(_ current: DirectoryListing?) -> some View {
    let state = pickerBar(current, added: added)
    let note: String =
      switch state {
      case .openRoot: Str.webLibrariesBrowserOpenRoot
      case .alreadyAdded(let path): Str.webLibrariesBrowserAlreadyAdded(path)
      case .adds(let path, _): Str.webLibrariesBrowserAdds(path)
      }
    let button: String =
      switch state {
      case .alreadyAdded: Str.webLibrariesBrowserAdded
      case .openRoot: Str.webLibrariesBrowserAdd
      case .adds(_, let name): Str.webLibrariesBrowserAddCurrent(name)
      }
    var adds: String?
    if case .adds(let path, _) = state { adds = path }
    return VStack(spacing: 0) {
      Separator()
      VStack(alignment: .leading, spacing: Space.s2_5) {
        Note(note)
        MatineeKit.MatineeButton(look: .primary, fullWidth: true) {
          if let adds { add(adds) }
        } label: {
          Text(button).textStyle(.sm, weight: .medium).lineLimit(1).truncationMode(.middle)
        }
        .disabled(adds == nil)
      }
      .padding(.horizontal, Space.gutter)
      .padding(.vertical, Space.s3)
      .frame(maxWidth: ADMIN_COLUMN)
      .frame(maxWidth: .infinity)
    }
    .background(palette.popover.ignoresSafeArea(edges: .bottom))
  }
}

/// The open folder's path, which a path typed in and Open replace.
private struct PathField: View {
  let path: String
  let onOpen: (String) -> Void
  @State private var draft: String
  @Environment(\.adminPalette) private var palette

  init(path: String, onOpen: @escaping (String) -> Void) {
    self.path = path
    self.onOpen = onOpen
    _draft = State(initialValue: path)
  }

  var body: some View {
    let typed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let can = !typed.isEmpty && typed != path
    MatineeKit.MatineeTextField(Str.webLibrariesBrowserPath, text: $draft) {
      MatineeKit.RoundIconButton(
        .chevronRight, label: Str.webLibrariesBrowserGo, look: .ghost, size: 32, iconSize: 18,
        tint: palette.mutedForeground
      ) { if can { onOpen(typed) } }
      .disabled(!can)
    }
    .keyboardType(.URL)
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .submitLabel(.go)
    .onSubmit { if can { onOpen(typed) } }
  }
}

/// A folder: a tap opens it, and the button beside its name adds it.
private struct FolderRow: View {
  let name: String
  var up = false
  let label: String
  var onAdd: (() -> Void)?
  let onOpen: () -> Void
  @Environment(\.adminPalette) private var palette

  init(name: String, up: Bool = false, label: String, onAdd: (() -> Void)? = nil, onOpen: @escaping () -> Void) {
    self.name = name
    self.up = up
    self.label = label
    self.onAdd = onAdd
    self.onOpen = onOpen
  }

  var body: some View {
    Pressable(action: onOpen) {
      HStack(spacing: Space.s3) {
        if up { MatineeKit.LucideIcon(.arrowLeft, size: 18, tint: palette.mutedForeground).frame(width: 24) }
        Text(name).textStyle(.base).foregroundStyle(palette.foreground).lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
        // Room for the add button, which sits over the row outside its own tap.
        if onAdd != nil { Color.clear.frame(width: TouchTarget, height: 1) }
        if !up { MatineeKit.LucideIcon(.chevronRight, size: 16, tint: palette.mutedForeground) }
      }
      .padding(.horizontal, Space.s4)
      .frame(minHeight: 52)
      .contentShape(Rectangle())
    }
    .accessibilityLabel(label)
    .overlay(alignment: .trailing) {
      if let onAdd {
        MatineeKit.RoundIconButton(
          .folderPlus, label: Str.webLibrariesBrowserAddNamed(name), look: .ghost, size: 36, iconSize: 18,
          tint: palette.mutedForeground, action: onAdd
        )
        .padding(.trailing, Space.s4 + 16 + Space.s3 - 4)
      }
    }
  }
}
