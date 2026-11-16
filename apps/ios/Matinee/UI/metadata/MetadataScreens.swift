import MatineeCore
import MatineeKit
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/*
 * MetadataScreens.kt: an admin's metadata tools, drawn as the web's
 * identify dialog and image editor: fix a title's match, and pick or
 * upload the images of a title, season, or episode. Pages rather than the
 * web's dialogs, as Android has them, since a phone's keyboard and a grid
 * of images need the whole screen; on an iPad the page keeps to the
 * dialog's width, so its rows don't stretch across the screen. What they
 * decide is MatineeCore's (Metadata/); the words are here.
 *
 * The photo library and Files are the system's pickers, which are services
 * of the platform rather than a look: Android has one picker, iOS keeps
 * photos and files apart, so Upload offers both.
 */

/// How wide the tools' column gets: the web's identify dialog's `max-w-xl`
/// leaves a row of results this wide, and the image editor's `max-w-3xl`.
private let FORM_WIDTH: CGFloat = 640
private let EDITOR_WIDTH: CGFloat = 840

/// The metadata provider of a library, which fix match and the image
/// editor ask: the provider, or nil when the library has none. For admins
/// only; the server turns anyone else away.
private func loadProvider(_ api: MatineeApi, _ libraryId: String) async throws -> MetadataProvider? {
  #if DEBUG
    if MetadataFixtures.on { return MetadataFixtures.provider }
  #endif
  async let libraries = api.libraries.list()
  async let providers = api.metadata.providers()
  return libraryProvider(libraryId, libraries: try await libraries, providers: try await providers)
}

/// The page's title loaded, or its loading and failure under the top bar.
private struct TitlePage<Content: View>: View {
  let titleId: String
  let heading: String
  @ViewBuilder let content: (Title) -> Content
  @State private var loader = Loader<Title>()

  var body: some View {
    Group {
      switch loader.state {
      case .loading: LoadingBox()
      case .failed(let message, let disconnected):
        ErrorBox(Str.titleLoadError, message, disconnected: disconnected, onRetry: loader.reload)
      case .ready(let title): content(shown(title))
      }
    }
    .topBar(heading) { DisconnectedAction(loader) }
    .loads(loader) { [titleId] api in try await api.titles.get(id: titleId) }
  }

  private func shown(_ title: Title) -> Title {
    #if DEBUG
      if MetadataFixtures.on { return MetadataFixtures.matched(title) }
    #endif
    return title
  }
}

/// A tool's page: its rows in the gutter, kept to `width` on a wide screen,
/// with room at the bottom.
private struct ToolPage<Content: View>: View {
  let width: CGFloat
  @ViewBuilder let content: () -> Content
  @Environment(\.gutter) private var gutter

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) { content() }
        .frame(maxWidth: width, alignment: .leading)
        .padding(.horizontal, gutter)
        // Under the page's name, where the eye starts, rather than centered away from it.
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Space.s1)
        .padding(.bottom, Space.s8)
    }
    .scrollDismissesKeyboard(.interactively)
  }
}

// MARK: - Identify

/// Search the library's provider by hand and pick the right entry, for a
/// title the automatic match got wrong or missed. Opens on a search for
/// the title's name and year.
struct IdentifyScreen: View {
  let titleId: String

  var body: some View {
    TitlePage(titleId: titleId, heading: Str.titleIdentifyTitle) { IdentifyForm(title: $0) }
  }
}

private struct IdentifyForm: View {
  let title: Title
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var dynamicType
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @State private var provider = Loader<MetadataProvider?>()
  @State private var name: String
  @State private var year: String
  @State private var submitted: IdentifyQuery
  /// Moves to send the same search again after it failed.
  @State private var attempt = 0
  @State private var results: Load<[MetadataMatch]> = .loading
  /// The entry being matched, whose answer the page waits for.
  @State private var matching: MetadataMatch?
  @State private var error: String?
  @State private var nameFocused = false
  @State private var yearFocused = false
  @ScaledMetric(relativeTo: .body) private var yearWidth: CGFloat = 96

  init(title: Title) {
    self.title = title
    _name = State(initialValue: title.name)
    _year = State(initialValue: title.year.map(String.init) ?? "")
    _submitted = State(initialValue: IdentifyQuery(name: title.name, year: title.year))
  }

  var body: some View {
    let providerName = provider.state.value??.name
    ToolPage(width: FORM_WIDTH) {
      if let providerName {
        Text(Str.titleIdentifyDescription(providerName, title.path))
          .textStyle(.sm).foregroundStyle(palette.mutedForeground)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.bottom, Space.s5)
      }
      form
      if let error {
        Callout(error, icon: .circleAlert, look: .destructive).padding(.top, Space.s4)
      }
      Separator().padding(.top, Space.s5).padding(.bottom, Space.s2)
      found(providerName)
    }
    .loads(provider) { [libraryId = title.libraryId] api in try await loadProvider(api, libraryId) }
    .task(id: SearchKey(query: submitted, attempt: attempt)) { await search(submitted) }
    .task(id: matching) { await identify() }
  }

  private struct SearchKey: Hashable {
    let query: IdentifyQuery
    let attempt: Int
  }

  /// The name and year, and the button that searches for them; the
  /// keyboard's Search key does too. A tablet has the room for the button
  /// beside them, as the web's dialog; a phone puts it under them, the
  /// width of the page, and the largest text sizes stack everything.
  @ViewBuilder private var form: some View {
    let stacked = dynamicType.isAccessibilitySize
    if stacked {
      VStack(alignment: .leading, spacing: Space.s3) {
        nameField
        yearField
        searchButton(fill: true)
      }
    } else if isWide(window) {
      HStack(alignment: .bottom, spacing: Space.s2) {
        nameField
        yearField.frame(width: yearWidth)
        searchButton(fill: false)
      }
    } else {
      VStack(spacing: Space.s3) {
        HStack(alignment: .bottom, spacing: Space.s2) {
          nameField
          yearField.frame(width: yearWidth)
        }
        searchButton(fill: true)
      }
    }
  }

  private var nameField: some View {
    FormField(Str.titleIdentifyName) {
      MatineeTextField("", text: $name, focused: $nameFocused)
        .textInputAutocapitalization(.words)
        .autocorrectionDisabled()
        .submitLabel(.search)
        .onSubmit(submit)
        .accessibilityLabel(Str.titleIdentifyName)
    }
  }

  private var yearField: some View {
    FormField(Str.titleIdentifyYear) {
      // Digits and punctuation rather than the number pad, which has no Search key.
      MatineeTextField(Str.titleIdentifyAnyYear, text: $year, focused: $yearFocused)
        .keyboardType(.numbersAndPunctuation)
        .submitLabel(.search)
        .onSubmit(submit)
        .accessibilityLabel(Str.titleIdentifyYear)
        .onChange(of: year) { _, typed in
          let digits = yearDigits(typed)
          if digits != typed { year = digits }
        }
    }
  }

  private func searchButton(fill: Bool) -> some View {
    MatineeButton(Str.titleIdentifySearch, icon: .search, look: .secondary, fullWidth: fill, action: submit)
  }

  @ViewBuilder private func found(_ providerName: String?) -> some View {
    switch results {
    case .loading:
      Spinner(size: 24, tint: palette.accent).frame(maxWidth: .infinity).padding(.vertical, Space.s10)
    case .failed(let message, let disconnected):
      ErrorSection(Str.titleIdentifyFailed, message, disconnected: disconnected) { attempt += 1 }
    case .ready(let matches) where matches.isEmpty:
      Text(Str.titleIdentifyEmpty(providerName ?? "", submitted.name))
        .textStyle(.sm).foregroundStyle(palette.mutedForeground)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, Space.s10)
    case .ready(let matches):
      VStack(spacing: 0) {
        ForEach(matches, id: \.id) { match in
          MatchRow(match: match, current: isCurrentMatch(match, of: title), pending: matching?.id == match.id) {
            pick(match)
          }
          .disabled(matching != nil)
        }
      }
      // The rows' wash reaches past the text, which lines up with the page's.
      .padding(.horizontal, -Space.s3)
    }
  }

  private func submit() {
    nameFocused = false
    yearFocused = false
    error = nil
    let query = IdentifyQuery(typed: name, year: year, fallback: title.name)
    // The same search again, as after one failed, still goes out.
    if query == submitted { attempt += 1 } else { submitted = query }
  }

  private func search(_ query: IdentifyQuery) async {
    guard let api else { return }
    results = .loading
    do {
      let found: [MetadataMatch]
      #if DEBUG
        if MetadataFixtures.on {
          found = try await MetadataFixtures.matches(query)
        } else {
          found = try await api.titles.findMatches(id: title.id, query: query.name, year: query.year)
        }
      #else
        found = try await api.titles.findMatches(id: title.id, query: query.name, year: query.year)
      #endif
      results = .ready(found)
    } catch {
      // A newer search took over.
      if Failure(error) == .cancelled || Task.isCancelled { return }
      results = .failed(describeFailure(error), disconnected: Failure(error).isDisconnect)
    }
  }

  private func pick(_ match: MetadataMatch) {
    error = nil
    matching = match
  }

  /// Matches the title to the entry picked. In the page's task, so leaving
  /// the page drops the answer rather than taking the person back from
  /// wherever they went.
  private func identify() async {
    guard let match = matching, let api else { return }
    do {
      let updated: Title
      #if DEBUG
        if MetadataFixtures.on && MetadataFixtures.pretends(match.id) {
          try await Task.sleep(for: .seconds(1))
          updated = try await api.titles.get(id: title.id)
        } else {
          updated = try await api.titles.identify(id: title.id, providerId: match.id)
        }
      #else
        updated = try await api.titles.identify(id: title.id, providerId: match.id)
      #endif
      viewer?.changed()
      snackbar.post(ToastMessage(Str.titleIdentifyMatched(updated.name), kind: .success))
      nav.back()
    } catch {
      if Failure(error) == .cancelled || Task.isCancelled { return }
      self.error = describeFailure(error)
      matching = nil
    }
  }
}

/// A provider's entry, as the web's result row: its poster, name and year,
/// whether it's the match now, and what it's about.
private struct MatchRow: View {
  let match: MetadataMatch
  let current: Bool
  let pending: Bool
  let onPick: () -> Void
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .body) private var posterWidth: CGFloat = 48

  var body: some View {
    Pressable(shape: .kit(Radius.lg), action: onPick) {
      HStack(alignment: .top, spacing: Space.s3) {
        Tone(match.id)
          .overlay { Picture(api?.art(match.poster)) }
          .frame(width: posterWidth, height: posterWidth * 3 / 2)
          .clipShape(RoundedRectangle.kit(Radius.sm))
          .overlay { RoundedRectangle.kit(Radius.sm).strokeBorder(palette.border) }
        VStack(alignment: .leading, spacing: Space.s1) {
          FlowRow(spacing: Space.s2, lineSpacing: Space.s1) {
            Text(match.name).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
            if let year = match.year {
              Text(String(year)).textStyle(.sm).foregroundStyle(palette.mutedForeground).monospacedDigit()
            }
            if current { Badge(Str.titleIdentifyCurrent, look: .secondary) }
          }
          if let overview = match.overview {
            Text(overview).textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(2)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .multilineTextAlignment(.leading)
        if pending { Spinner(size: 16, tint: palette.accent).padding(.top, Space.s1) }
      }
      .padding(Space.s3)
      .contentShape(RoundedRectangle.kit(Radius.lg))
      .accessibilityElement(children: .combine)
    }
    .accessibilityAddTraits(current ? .isSelected : [])
  }
}

// MARK: - Images

/// What a change to an image does, to show its spinner.
private enum Change: Hashable {
  /// One of the provider's images, or none with nil.
  case pick(String?)
  case upload(Data, String)
  case reset

  var isUpload: Bool {
    if case .upload = self { return true }
    return false
  }
}

/// Pick the images of a title, season, or episode from what the library's
/// provider has, or upload them. What an admin picks stays when the
/// metadata is fetched again.
struct ImagesScreen: View {
  let target: ImageTarget

  var body: some View {
    TitlePage(titleId: target.titleId, heading: Str.titleImagesTitle) {
      ImageEditor(title: $0, target: target)
    }
  }
}

/// Where the provider's images come from, which they're fetched again for.
private struct RemoteKey: Hashable {
  var slot: String
  var allLanguages: Bool
  var lists: Bool
  var attempt: Int
}

private struct ImageEditor: View {
  let title: Title
  let target: ImageTarget
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter
  @Environment(\.dynamicTypeSize) private var dynamicType
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @State private var slot: String
  @State private var images = Loader<[ItemImage]>()
  @State private var provider = Loader<MetadataProvider?>()
  @State private var allLanguages = false
  @State private var remote: Load<[RemoteImage]> = .loading
  @State private var remoteAttempt = 0
  @State private var busy: Change?
  @State private var gridWidth: CGFloat = 0
  @State private var uploadMenu = false
  @State private var picking = false
  @State private var importing = false
  @State private var photo: PhotosPickerItem?

  init(title: Title, target: ImageTarget) {
    self.title = title
    self.target = target
    _slot = State(initialValue: target.slots.first ?? ImageSlot.poster)
  }

  var body: some View {
    let providerName = usableProvider(provider.state.value ?? nil)?.name
    let lists = listsImages(provider: provider.state.value ?? nil, title: title)
    let current = images.state.value
    let inUse = current?.first { $0.slot == slot }
    ToolPage(width: EDITOR_WIDTH) {
      Text(providerName.map { Str.titleImagesDescription(name, $0) } ?? Str.titleImagesDescriptionLocal(name))
        .textStyle(.sm).foregroundStyle(palette.mutedForeground)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.bottom, Space.s5)
      if case .failed(let message, let disconnected) = images.state, current == nil {
        ErrorSection(Str.titleImagesFailed, message, disconnected: disconnected, onRetry: images.reload)
      } else {
        slots(current, providerName: providerName)
        buttons(inUse, providerName: providerName, lists: lists)
          .padding(.top, Space.s4)
        Separator().padding(.top, Space.s3).padding(.bottom, Space.s4)
        candidates(inUse, providerName: providerName, lists: lists)
          .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { gridWidth = $0 }
      }
    }
    .loads(images) { [target] api in
      try await api.titles.images(id: target.titleId, season: target.season, episode: target.episode)
    }
    .loads(provider) { [libraryId = title.libraryId] api in try await loadProvider(api, libraryId) }
    .task(id: RemoteKey(slot: slot, allLanguages: allLanguages, lists: lists, attempt: remoteAttempt)) {
      guard lists else { return }
      await loadRemote()
    }
    // A slot starts over, with its own language switch, as the web's panel does.
    .onChange(of: slot) { allLanguages = false }
    .photosPicker(isPresented: $picking, selection: $photo, matching: .images, preferredItemEncoding: .compatible)
    .onChange(of: photo) { _, item in
      guard let item else { return }
      photo = nil
      Task { await upload(photo: item) }
    }
    .fileImporter(isPresented: $importing, allowedContentTypes: [.jpeg, .png, .webP]) { result in
      if case .success(let url) = result { upload(file: url) }
    }
    #if DEBUG
      .task { await devDo() }
    #endif
  }

  #if DEBUG
    /// `-dev.metadataDo upload|remove|reset|menu`, without a finger: upload a
    /// made-up picture to the first slot, remove its image, put the
    /// provider's back, or open Upload's menu. Once.
    private func devDo() async {
      guard let what = UserDefaults.standard.string(forKey: "dev.metadataDo") else { return }
      UserDefaults.standard.removeObject(forKey: "dev.metadataDo")
      try? await Task.sleep(for: .seconds(2))
      switch what {
      case "upload":
        let size = CGSize(width: 400, height: imageAspect(slot) < 1 ? 600 : 225)
        let picture = UIGraphicsImageRenderer(size: size).image { context in
          UIColor(red: 0.1, green: 0.55, blue: 0.6, alpha: 1).setFill()
          context.fill(CGRect(origin: .zero, size: size))
          UIColor.white.setFill()
          context.fill(CGRect(x: size.width * 0.2, y: size.height * 0.4, width: size.width * 0.6, height: size.height * 0.2))
        }
        send(checkUpload(picture.jpegData(compressionQuality: 0.8)))
      case "remove": change(.pick(nil))
      case "reset": change(.reset)
      case "menu": uploadMenu = true
      default: break
      }
    }
  #endif

  /// What the images are of: the title, a season of it, or an episode.
  private var name: String {
    switch ImageOwner(target) {
    case .title: title.name
    case .season(let season): Str.titleSeasonOf(title.name, seasonName(season))
    case .episode(let season, let episode):
      Str.titleSeasonOf(title.name, season == 0 ? Str.mediaSpecial(episode) : Str.mediaEpisodeCode(season, episode))
    }
  }

  /// Each slot with the image it has, which also picks the slot to change,
  /// in a row that scrolls sideways when they don't fit, past the page's
  /// edges. At the accessibility text sizes they stack, so what each says
  /// wraps rather than runs off.
  @ViewBuilder private func slots(_ current: [ItemImage]?, providerName: String?) -> some View {
    let several = target.slots.count > 1
    let stacked = dynamicType.isAccessibilitySize
    let cards = ForEach(target.slots, id: \.self) { each in
      SlotCard(
        slot: each, current: current?.first { $0.slot == each }, loading: current == nil, toneKey: title.id,
        providerName: providerName, selected: several && each == slot, wraps: stacked,
        onSelect: several ? { withMotion(Motion.color) { slot = each } } : nil)
    }
    if stacked || !several {
      VStack(alignment: .leading, spacing: Space.s2) { cards }
    } else {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: Space.s2) { cards }
      }
      .contentMargins(.horizontal, gutter, for: .scrollContent)
      .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
      .padding(.horizontal, -gutter)
    }
  }

  /// Upload, remove, and back to the provider's, then the language switch:
  /// one line on a tablet, as the web's panel; a phone's buttons fill the
  /// width, upload and remove side by side and going back to the
  /// provider's, whose name is long, on a line of its own, as Android's.
  @ViewBuilder private func buttons(_ inUse: ItemImage?, providerName: String?, lists: Bool) -> some View {
    let offered = ImageButtons(inUse: inUse, lists: lists)
    if isWide(window) && !dynamicType.isAccessibilitySize {
      HStack(spacing: Space.s2) {
        uploadButton(fill: false, size: .md)
        if offered.remove { removeButton(fill: false, size: .md) }
        if offered.reset { resetButton(providerName ?? "", fill: false, size: .md) }
        Spacer(minLength: Space.s4)
        if lists { languageSwitch }
      }
      .disabled(busy != nil)
    } else {
      VStack(alignment: .leading, spacing: Space.s2) {
        HStack(spacing: Space.s2) {
          uploadButton(fill: true, size: .touch)
          if offered.remove { removeButton(fill: true, size: .touch) }
        }
        if offered.reset { resetButton(providerName ?? "", fill: true, size: .touch) }
        if lists { languageSwitch.frame(maxWidth: .infinity, alignment: .trailing) }
      }
      .disabled(busy != nil)
    }
  }

  private var languageSwitch: some View {
    HStack(spacing: Space.s3) {
      Text(Str.titleImagesAllLanguages).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        .accessibilityHidden(true)
      Switch(isOn: $allLanguages, label: Str.titleImagesAllLanguages)
    }
    .frame(minHeight: TouchTarget)
  }

  /// Upload offers both of iOS's pickers, where Android has one: the photo
  /// library, which needs no permission, and Files.
  private func uploadButton(fill: Bool, size: ButtonSize) -> some View {
    MatineeButton(
      Str.titleImagesUpload, icon: .imageUp, look: .secondary, size: size, pending: busy?.isUpload == true,
      fullWidth: fill
    ) { uploadMenu = true }
    .dropdownMenu(isPresented: $uploadMenu) {
      MenuItem(Str.iosImagesFromPhotos) { picking = true }
      MenuItem(Str.iosImagesFromFiles) { importing = true }
    }
  }

  private func removeButton(fill: Bool, size: ButtonSize) -> some View {
    MatineeButton(
      Str.titleImagesRemove, icon: .trash, look: fill ? .outline : .ghost, size: size, pending: busy == .pick(nil),
      fullWidth: fill
    ) { change(.pick(nil)) }
  }

  private func resetButton(_ providerName: String, fill: Bool, size: ButtonSize) -> some View {
    MatineeButton(
      Str.titleImagesReset(providerName), icon: .rotateCcw, look: fill ? .outline : .ghost, size: size,
      pending: busy == .reset, fullWidth: fill
    ) { change(.reset) }
  }

  @ViewBuilder private func candidates(_ inUse: ItemImage?, providerName: String?, lists: Bool) -> some View {
    if provider.state.isLoading {
      Spinner(size: 24, tint: palette.accent).frame(maxWidth: .infinity).padding(.vertical, Space.s10)
    } else if !lists {
      EmptyNote(text: providerName.map(Str.titleImagesUnmatched) ?? Str.titleImagesNoProvider)
    } else {
      switch remote {
      case .loading:
        Spinner(size: 24, tint: palette.accent).frame(maxWidth: .infinity).padding(.vertical, Space.s10)
      case .failed(let message, let disconnected):
        ErrorSection(Str.titleImagesRemoteFailed, message, disconnected: disconnected) { remoteAttempt += 1 }
      case .ready(let found) where found.isEmpty:
        EmptyNote(
          text: allLanguages
            ? Str.titleImagesEmpty(providerName ?? "") : Str.titleImagesEmptyLanguage(providerName ?? ""))
      case .ready(let found):
        let columns = imageColumns(
          slot, width: gridWidth > 0 ? gridWidth : window.width - 2 * gutter,
          largeText: dynamicType.isAccessibilitySize)
        LazyVGrid(
          columns: Array(repeating: GridItem(.flexible(), spacing: Space.s3, alignment: .top), count: columns),
          alignment: .leading, spacing: Space.s4
        ) {
          ForEach(found, id: \.id) { image in
            Choice(
              image: image, slot: slot, toneKey: title.id, inUse: image.id == inUse?.image?.id,
              pending: busy == .pick(image.id)
            ) { change(.pick(image.id)) }
            .disabled(busy != nil)
          }
        }
      }
    }
  }

  private func loadRemote() async {
    guard let api else { return }
    remote = .loading
    do {
      let found: [RemoteImage]
      #if DEBUG
        if MetadataFixtures.on {
          found = try await MetadataFixtures.remoteImages(slot, allLanguages: allLanguages)
        } else {
          found = try await api.titles.remoteImages(
            id: target.titleId, slot: slot, season: target.season, episode: target.episode,
            allLanguages: allLanguages)
        }
      #else
        found = try await api.titles.remoteImages(
          id: target.titleId, slot: slot, season: target.season, episode: target.episode, allLanguages: allLanguages)
      #endif
      remote = .ready(found)
    } catch {
      if Failure(error) == .cancelled || Task.isCancelled { return }
      remote = .failed(describeFailure(error), disconnected: Failure(error).isDisconnect)
    }
  }

  private func showError(_ message: String?) {
    snackbar.post(
      ToastMessage(Str.titleImagesError, description: message?.isEmpty == false ? message : nil, kind: .error))
  }

  private func change(_ action: Change) {
    guard let api, busy == nil else { return }
    busy = action
    let target = target
    let slot = slot
    Task {
      defer { busy = nil }
      do {
        let answer: [ItemImage] =
          switch action {
          case .pick(let imageId):
            try await api.titles.setImage(
              id: target.titleId, slot: slot, imageId: imageId, season: target.season, episode: target.episode)
          case .upload(let bytes, let type):
            try await api.titles.uploadImage(
              id: target.titleId, slot: slot,
              file: FilePart(bytes: bytes, type: type, name: "image." + type.dropFirst("image/".count)),
              season: target.season, episode: target.episode)
          case .reset:
            try await api.titles.resetImage(id: target.titleId, slot: slot, season: target.season, episode: target.episode)
          }
        images.show(answer)
        // Pages that show the images fetch them again. Each image has its
        // own address, so a changed one is a new picture to the cache.
        viewer?.changed()
      } catch {
        if Failure(error) == .cancelled { return }
        showError(describeFailure(error))
      }
    }
  }

  private func send(_ checked: Result<FilePart, UploadProblem>) {
    switch checked {
    case .success(let part): change(.upload(part.bytes, part.type))
    case .failure(.wrongType): showError(Str.titleImagesWrongType)
    case .failure(.tooBig): showError(Str.titleImagesTooBig)
    case .failure(.unreadable): showError(nil)
    }
  }

  /// A photo from the library. The picker hands it over as a JPEG when it's
  /// kept in another format, and one it can't is drawn into one, since a
  /// photo is a photo whatever the library keeps it as.
  private func upload(photo item: PhotosPickerItem) async {
    let data = try? await item.loadTransferable(type: Data.self)
    if let data, !data.isEmpty, sniffImageType(data) == nil, let image = UIImage(data: data) {
      return send(checkUpload(image.jpegData(compressionQuality: 0.9)))
    }
    send(checkUpload(data))
  }

  /// A file from Files, read no more than a byte past the limit, to tell
  /// one over it without reading all of it.
  private func upload(file url: URL) {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    let handle = try? FileHandle(forReadingFrom: url)
    defer { try? handle?.close() }
    send(checkUpload(try? handle?.read(upToCount: Int(MAX_IMAGE_BYTES) + 1)))
  }
}

/// Why there's nothing to pick, in the middle of where the images go.
private struct EmptyNote: View {
  let text: String
  @Environment(\.palette) private var palette

  var body: some View {
    Text(text).textStyle(.sm).foregroundStyle(palette.mutedForeground)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
      .padding(.vertical, Space.s10)
  }
}

private func slotName(_ slot: String) -> String {
  switch slot {
  case ImageSlot.poster: Str.titleImagesSlotPoster
  case ImageSlot.backdrop: Str.titleImagesSlotBackdrop
  case ImageSlot.logo: Str.titleImagesSlotLogo
  default: Str.titleImagesSlotStill
  }
}

/// "Picked from TMDB", "Uploaded", "None", and so on.
private func stateText(_ state: ImageState) -> String {
  switch state {
  case .removed: Str.titleImagesStateRemoved
  case .noneFrame: Str.titleImagesStateNoneFrame
  case .none: Str.titleImagesStateNone
  case .uploaded: Str.titleImagesStateUploaded
  case .picked: Str.titleImagesStatePicked
  case .pickedFrom(let provider): Str.titleImagesStatePickedFrom(provider)
  case .from(let provider): Str.titleImagesStateFrom(provider)
  }
}

/// A slot's image over the title's tone: a logo whole and clear of the
/// edges, the rest filling the frame.
private struct SlotImage: View {
  let slot: String
  let source: ImageSource?
  let inset: CGFloat
  let toneKey: String

  var body: some View {
    let logo = slot == ImageSlot.logo
    Tone(toneKey).overlay { Picture(source, contentMode: logo ? .fit : .fill).padding(logo ? inset : 0) }
  }
}

/// A slot's name and the image it has, all at one height whatever the
/// image's shape, as the web's slot card: `rounded-lg border p-1.5 pr-4`,
/// the one picked on the accent's tint. Picks the slot when there are several.
private struct SlotCard: View {
  let slot: String
  let current: ItemImage?
  let loading: Bool
  let toneKey: String
  let providerName: String?
  let selected: Bool
  /// Whether it takes the width, its words wrapping, rather than its own width on one line.
  let wraps: Bool
  let onSelect: (() -> Void)?
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .body) private var height: CGFloat = 56

  var body: some View {
    let shape = RoundedRectangle.kit(Radius.lg)
    let card = HStack(spacing: Space.s3) {
      SlotImage(slot: slot, source: api?.art(current?.image, size: .thumb), inset: 4, toneKey: toneKey)
        .frame(width: height * imageAspect(slot), height: height)
        .clipShape(RoundedRectangle.kit(Radius.md))
        .overlay { RoundedRectangle.kit(Radius.md).strokeBorder(palette.border) }
      VStack(alignment: .leading, spacing: 0) {
        Text(slotName(slot)).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
        if let current {
          Text(stateText(ImageState(slot: slot, current: current, providerName: providerName)))
            .textStyle(.xs).foregroundStyle(palette.mutedForeground)
        } else if loading {
          Skeleton(radius: Radius.sm).frame(width: 72, height: 10).padding(.vertical, 3)
        }
      }
      .lineLimit(wraps ? nil : 1)
      .fixedSize(horizontal: !wraps, vertical: false)
      .frame(maxWidth: wraps ? .infinity : nil, alignment: .leading)
    }
    .padding(Space.s1_5)
    .padding(.trailing, Space.s2_5)
    .background(selected ? palette.accentSoft : .clear, in: shape)
    .overlay { shape.strokeBorder(selected ? palette.accent : palette.hairline) }
    .contentShape(shape)
    if let onSelect {
      Pressable(shape: shape, action: onSelect) { card }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    } else {
      card.accessibilityElement(children: .combine)
    }
  }
}

/// One of the provider's images: the picture, a tick on the one in use,
/// and its size and language under it.
private struct Choice: View {
  let image: RemoteImage
  let slot: String
  let toneKey: String
  let inUse: Bool
  let pending: Bool
  let onPick: () -> Void
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette

  var body: some View {
    let lines = captionLines(ImageCaption(image, slot: slot))
    let shape = RoundedRectangle.kit(Radius.md)
    Pressable(shape: shape, action: onPick) {
      VStack(alignment: .leading, spacing: Space.s1_5) {
        Color.clear
          .aspectRatio(imageAspect(slot), contentMode: .fit)
          .frame(maxWidth: .infinity)
          .overlay { SlotImage(slot: slot, source: api?.art(image.preview), inset: 8, toneKey: toneKey) }
          .overlay {
            if pending {
              Color.black.opacity(0.5)
              Spinner(size: 20, tint: .white)
            }
          }
          .clipShape(shape)
          .overlay { shape.strokeBorder(inUse ? palette.accent : palette.border, lineWidth: inUse ? 2 : 1) }
          .overlay(alignment: .topTrailing) {
            if inUse {
              LucideIcon(.check, size: 14, tint: palette.accentForeground, scales: false)
                .frame(width: 20, height: 20)
                .background(palette.accent, in: Circle())
                .padding(Space.s1_5)
            }
          }
        // On one line where it fits, as the web's; a line each where three
        // posters to a row leave no room for both.
        if !lines.isEmpty {
          ViewThatFits(in: .horizontal) {
            Text(lines.joined(separator: " · ")).lineLimit(1).fixedSize()
            VStack(alignment: .leading, spacing: 0) {
              ForEach(lines, id: \.self) { Text($0).lineLimit(1) }
            }
          }
          .textStyle(.xs)
          .foregroundStyle(palette.mutedForeground)
          .monospacedDigit()
        }
      }
      .contentShape(Rectangle())
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(lines.joined(separator: ", "))
    .accessibilityValue(inUse ? Str.titleImagesInUse : "")
    .accessibilityHint(inUse ? "" : Str.titleImagesUse)
    .accessibilityAddTraits(inUse ? [.isSelected, .isButton] : .isButton)
  }

  /// "1000 × 1500" and "English", from what the provider says.
  private func captionLines(_ caption: ImageCaption) -> [String] {
    var lines: [String] = []
    if let size = caption.size { lines.append(Str.titleImagesSize(size.width, size.height)) }
    switch caption.language {
    case .code(let code): lines.append(languageName(code, locale: .app))
    case .noText: lines.append(Str.titleImagesNoText)
    case nil: break
    }
    return lines
  }
}
