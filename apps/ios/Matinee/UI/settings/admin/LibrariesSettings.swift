import MatineeCore
import SwiftUI

/*
 * LibrariesSettings.kt: the libraries, the editor for one, and the
 * server's folders to pick its folders from. What a row says, the draft,
 * and the picker's bar are MatineeCore's (Admin/LibraryForms.swift).
 */

/// How often the list asks again while a scan or a fetch runs.
private let BUSY_POLL: Duration = .seconds(2)

/// The libraries, as the web's libraries panel: each with its titles and
/// what the server is doing to it. A tap offers scanning it, fetching its
/// metadata again, editing it, or removing it; Add library opens the same
/// editor empty. While a scan or a fetch runs, the page asks again every
/// few seconds.
struct LibrariesSettings: View {
  @State private var loader = Loader<[Library]>()
  @State private var providers = Loader<[MetadataProvider]>()
  @State private var saver = Saver()
  @State private var confirmation: Confirmation?
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette
  @Environment(ShellNav.self) private var shell: ShellNav?

  var body: some View {
    let busy = librariesBusy(loader.state.value ?? [])
    SettingsScaffold(Str.settingsAdminLibraries) {
      AdminLoaded(loader, failed: Str.webLibrariesLoadFailed) { list in
        VStack(alignment: .leading, spacing: 16) {
          if list.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
              Text(Str.webLibrariesEmptyTitle).textStyle(.titleMedium)
              Text(Str.webLibrariesEmptyDescription).textStyle(.bodyMedium).foregroundStyle(palette.muted)
            }
          } else {
            Panel {
              ForEach(Array(list.enumerated()), id: \.element.id) { index, library in
                if index > 0 { RowDivider() }
                LibraryRow(
                  library: library, state: libraryState(library, providers: providers.state.value),
                  onScan: { scan(library) }, onRefresh: { refresh(library) },
                  onEdit: { nav.libraryEditor(library.id) }, onRemove: { askRemove(library) })
              }
            }
          }
          MatineeButton { nav.libraryEditor(nil) } label: {
            HStack(spacing: 8) {
              LucideIcon(.folderPlus, size: 18)
              Text(Str.webLibrariesAdd)
            }
            .frame(maxWidth: .infinity)
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
    .confirming($confirmation)
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
      title: Str.webLibrariesRemoveTitle(library.name), body: Str.webLibrariesRemoveDescription,
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

/// A library: its kind's icon, name, and what it holds or what the server is
/// doing to it. A tap opens what can be done to it, under its folders.
private struct LibraryRow: View {
  let library: Library
  let state: LibraryState
  let onScan: () -> Void
  let onRefresh: () -> Void
  let onEdit: () -> Void
  let onRemove: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Menu {
      Section(library.paths.joined(separator: ", ")) {
        MenuItem(.refreshCw, Str.webLibrariesScanNow, action: onScan)
        if library.metadataProvider != nil {
          MenuItem(.image, Str.webLibrariesRefreshMetadata, action: onRefresh)
        }
        MenuItem(.settings, Str.webLibrariesEdit, action: onEdit)
        MenuItem(.trash, Str.webLibrariesRemove, destructive: true, action: onRemove)
      }
    } label: {
      HStack(spacing: 14) {
        LucideIcon(library.kind == LibraryKind.shows ? .tv : .film, size: 20, tint: palette.muted)
        VStack(alignment: .leading, spacing: 0) {
          Text(library.name).textStyle(.bodyLarge).foregroundStyle(palette.foreground).lineLimit(1)
          Text(status).textStyle(.bodySmall).foregroundStyle(palette.muted).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if state == .scanning || library.refreshing {
          ProgressView().controlSize(.small).tint(palette.accent)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .frame(minHeight: MinTouch)
      .contentShape(Rectangle())
    }
    .buttonStyle(RowPress())
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
  @State private var libraries = Loader<[Library]>()
  @State private var providers = Loader<[MetadataProvider]>()
  @Environment(\.palette) private var palette

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
        LoadingBox().background(palette.background).topBar(title)
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
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

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
    SettingsScaffold(title) {
      details
      folders
    }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        SaveButton(
          label: existing == nil ? Str.webLibrariesBrowserAdd : Str.webLibrariesDialogSave,
          busy: saver.saving, action: save
        )
        .disabled(!draft.valid || saver.saving)
      }
    }
    // The folder the picker handed back, added once, as this page shows again.
    .onChange(of: results.peek(PICKED_FOLDER), initial: true) {
      if let picked = results.take(PICKED_FOLDER) { withMotion(Motion.enter) { draft.add(picked) } }
    }
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: 8) {
      Panel {
        TextRow(Str.webLibrariesDialogName, text: $draft.name, placeholder: Str.webLibrariesDialogNamePlaceholder)
          .focused($naming)
          .onSubmit { naming = false }
        RowDivider()
        PickerRow(
          Str.webLibrariesDialogType,
          options: [(LibraryKind.movies, Str.webLibrariesDialogKindMovies), (LibraryKind.shows, Str.webLibrariesDialogKindShows)],
          current: draft.kind
        ) { draft.kind = $0 }
        RowDivider()
        PickerRow(
          Str.webLibrariesDialogMetadata,
          options: [(nil as String?, Str.webLibrariesDialogNoProvider)]
            + providers.map { ($0.id, $0.configured ? $0.name : "\($0.name) · \(Str.webLibrariesDialogNeedsKey)") },
          current: draft.provider
        ) { draft.pick(provider: $0, from: providers) }
        Reveal(draft.provider != nil) {
          RowDivider()
          ListPickerRow(
            Str.webLibrariesDialogLanguage,
            options: offeredMetadataLanguages(draft.language).map { ($0.value, languageName($0.tag)) },
            current: draft.language
          ) { draft.language = $0 }
        }
      }
      Reveal(draft.provider == nil) {
        Note(Str.webLibrariesDialogNoProviderHint)
      }
    }
  }

  private var folders: some View {
    SettingsSection(Str.webLibrariesDialogFolders) {
      Panel {
        ForEach(draft.paths, id: \.self) { path in
          HStack(spacing: 12) {
            LucideIcon(.server, size: 18, tint: palette.muted)
            Text(path).textStyle(.bodyMedium).lineLimit(2).truncationMode(.middle)
              .frame(maxWidth: .infinity, alignment: .leading)
            RoundIconButton(.x, label: Str.webLibrariesDialogRemoveFolder(path), background: .clear) {
              withMotion(Motion.exit) { draft.remove(path) }
            }
          }
          .padding(.leading, 16)
          .padding(.trailing, 4)
          .padding(.vertical, 2)
          RowDivider()
        }
        Button {
          // The name's keyboard would open again over the editor when the picker hands back.
          naming = false
          nav.folderPicker(draft.pickerStart(existing: existing, knownPath: knownPath), draft.paths)
        } label: {
          HStack(spacing: 12) {
            LucideIcon(.folderPlus, size: 18, tint: palette.accent)
            Text(Str.webLibrariesDialogAddFolder).textStyle(.bodyLarge).foregroundStyle(palette.accent)
            Spacer(minLength: 0)
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 14)
          .frame(minHeight: MinTouch)
          .contentShape(Rectangle())
        }
        .buttonStyle(RowPress())
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

/// The bar's button that saves a page's form: its name, or a spinner while the save is out.
struct SaveButton: View {
  let label: String
  let busy: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    let button = Button(action: action) {
      if busy {
        ProgressView().controlSize(.small)
      } else {
        Text(label).textStyle(.labelLarge)
      }
    }
    .tint(palette.accent)
    if #available(iOS 26, *) {
      button.buttonStyle(.glassProminent)
    } else {
      button.buttonStyle(.borderedProminent)
    }
  }
}

/// The server's folders, one level at a time, as a page over the editor,
/// opening at `start`, with the folders in `added` marked. A row opens its
/// folder or adds it straight away; the bar at the bottom adds the one
/// that's open. Adding goes back to the editor with the folder.
struct FolderPickerScreen: View {
  let start: String?
  let added: [String]
  @State private var path: String?
  @State private var listing: DirectoryListing?
  @State private var error: String?
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    let current = listing
    VStack(spacing: 0) {
      // Keyed by the folder, so opening another one shows its path.
      PathField(path: current?.path ?? path ?? "/") { path = $0 }
        .id(current?.path ?? path)
        .padding(.horizontal, Gutter)
        .padding(.bottom, 8)
      ZStack {
        if let current {
          ScrollView {
            LazyVStack(spacing: 0) {
              if let parent = current.parent {
                FolderRow(name: "..", up: true, label: Str.webLibrariesBrowserParent) { path = parent }
              }
              if current.directories.isEmpty {
                Note(Str.webLibrariesBrowserEmpty).padding(.horizontal, Gutter).padding(.vertical, 16)
              }
              ForEach(current.directories, id: \.path) { directory in
                FolderRow(
                  name: directory.name, label: Str.webLibrariesBrowserOpen(directory.name),
                  onAdd: added.contains(directory.path) ? nil : { add(directory.path) }
                ) { path = directory.path }
              }
            }
          }
          .scrollDismissesKeyboard(.interactively)
        } else if let error {
          Text(error).textStyle(.bodySmall).foregroundStyle(palette.danger).multilineTextAlignment(.center)
            .padding(Gutter)
        } else {
          ProgressView().tint(palette.accent).accessibilityLabel(Str.loadingInProgress)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    // Always there, so the list above doesn't jump when the first folder loads.
    .safeAreaInset(edge: .bottom, spacing: 0) { bar(current) }
    .background(palette.background)
    .topBar(Str.webLibrariesDialogBrowse)
    .task(id: path ?? "") { await open(path) }
  }

  init(start: String?, added: [String]) {
    self.start = start
    self.added = added
    _path = State(initialValue: start)
  }

  private func open(_ folder: String?) async {
    guard let api else { return }
    error = nil
    do {
      listing = try await api.admin.browse(path: folder)
    } catch {
      if Failure(error) == .cancelled { return }
      listing = nil
      self.error = describeFailure(error)
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
    return VStack(alignment: .leading, spacing: 10) {
      Note(note)
      MatineeButton {
        if case .adds(let path, _) = state { add(path) }
      } label: {
        Text(button).truncationMode(.middle).frame(maxWidth: .infinity)
      }
      .disabled(!isAdds(state))
    }
    .padding(.horizontal, Gutter)
    .padding(.vertical, 12)
    .background(palette.card)
    .overlay(alignment: .top) { RowDivider() }
  }

  private func isAdds(_ state: PickerBar) -> Bool {
    if case .adds = state { return true }
    return false
  }
}

/// The open folder's path, which a path typed in and Go replace.
private struct PathField: View {
  let path: String
  let onOpen: (String) -> Void
  @State private var draft: String
  @Environment(\.palette) private var palette

  init(path: String, onOpen: @escaping (String) -> Void) {
    self.path = path
    self.onOpen = onOpen
    _draft = State(initialValue: path)
  }

  var body: some View {
    let typed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let can = !typed.isEmpty && typed != path
    MatineeTextField($draft, placeholder: Str.webLibrariesBrowserPath) {
      RoundIconButton(
        .chevronRight, label: Str.webLibrariesBrowserGo, size: 36, iconSize: 18, tint: palette.muted, background: .clear
      ) { if can { onOpen(typed) } }
      .disabled(!can)
      .padding(.trailing, -10)
    }
    .keyboardType(.URL)
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .submitLabel(.go)
    .onSubmit { if can { onOpen(typed) } }
  }
}

private struct FolderRow: View {
  let name: String
  var up = false
  let label: String
  var onAdd: (() -> Void)?
  let onOpen: () -> Void
  @Environment(\.palette) private var palette

  init(name: String, up: Bool = false, label: String, onAdd: (() -> Void)? = nil, onOpen: @escaping () -> Void) {
    self.name = name
    self.up = up
    self.label = label
    self.onAdd = onAdd
    self.onOpen = onOpen
  }

  var body: some View {
    HStack(spacing: 0) {
      Button(action: onOpen) {
        HStack(spacing: 14) {
          if up { LucideIcon(.arrowLeft, size: 16, tint: palette.muted) }
          Text(name).textStyle(.bodyLarge).foregroundStyle(palette.foreground).lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, Gutter)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
      }
      .buttonStyle(RowPress())
      .accessibilityLabel(label)
      if let onAdd {
        RoundIconButton(.folderPlus, label: Str.webLibrariesBrowserAddNamed(name), tint: palette.muted, background: .clear, action: onAdd)
          .padding(.trailing, 4)
      }
      if !up {
        Button(action: onOpen) {
          LucideIcon(.chevronRight, size: 16, tint: palette.muted)
            .frame(minWidth: 28, minHeight: 52)
            .padding(.trailing, Gutter - 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPress())
        .accessibilityHidden(true)
      }
    }
  }
}
