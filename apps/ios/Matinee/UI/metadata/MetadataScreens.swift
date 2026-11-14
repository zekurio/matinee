import MatineeCore
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/*
 * MetadataScreens.kt: an admin's metadata tools, as the web's: fix a
 * title's match, and pick or upload the images of a title, season, or
 * episode. Pages rather than the web's dialogs, as a phone's keyboard and
 * a grid of images need the whole screen. What they decide is MatineeCore's
 * (Metadata/); the words are here.
 */

/// The metadata provider of a library, which fix match and the image
/// editor ask: the provider, or nil when the library has none. For admins
/// only; the server turns anyone else away, which reads as none.
private func libraryProvider(_ api: MatineeApi, _ libraryId: String) async throws -> MetadataProvider? {
  #if DEBUG
    if MetadataFixtures.on { return MetadataFixtures.provider }
  #endif
  guard let id = try await api.libraries.list().first(where: { $0.id == libraryId })?.metadataProvider else {
    return nil
  }
  return try await api.metadata.providers().first { $0.id == id }
}

/// The page's title loaded, or its loading and failure under the top bar.
private struct TitlePage<Content: View>: View {
  let titleId: String
  let heading: String
  @ViewBuilder let content: (Title) -> Content
  @State private var loader = Loader<Title>()
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      switch loader.state {
      case .loading: LoadingBox()
      case .failed(let message, let disconnected):
        ErrorBox(Str.titleLoadError, message, disconnected: disconnected, onRetry: loader.reload)
      case .ready(let title): content(shown(title))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(palette.background)
    .topBar(heading)
    .loads(loader) { [titleId] api in try await api.titles.get(id: titleId) }
  }

  private func shown(_ title: Title) -> Title {
    #if DEBUG
      if MetadataFixtures.on { return MetadataFixtures.matched(title) }
    #endif
    return title
  }
}

/// A page's rows, in the gutter, with room at the bottom.
private struct FormPage<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) { content() }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8)
        .padding(.bottom, 24)
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
  @State private var results: Load<[MetadataMatch]> = .loading
  /// The entry being matched, whose answer the page waits for.
  @State private var matching: MetadataMatch?
  @State private var error: String?
  @ScaledMetric(relativeTo: .body) private var yearWidth: CGFloat = 92

  init(title: Title) {
    self.title = title
    _name = State(initialValue: title.name)
    _year = State(initialValue: title.year.map(String.init) ?? "")
    _submitted = State(initialValue: IdentifyQuery(name: title.name, year: title.year))
  }

  var body: some View {
    let providerName = provider.state.value??.name
    FormPage {
      Group {
        if let providerName {
          Text(Str.titleIdentifyDescription(providerName, title.path))
            .textStyle(.bodyMedium).foregroundStyle(palette.muted)
            .padding(.bottom, 16)
        }
        form
        if let error {
          Text(error).textStyle(.bodyMedium).foregroundStyle(palette.danger).padding(.bottom, 8)
        }
      }
      .padding(.horizontal, Gutter)
      found(providerName)
    }
    .loads(provider) { [libraryId = title.libraryId] api in try await libraryProvider(api, libraryId) }
    .task(id: submitted) { await search(submitted) }
    .task(id: matching) { await identify() }
  }

  /// The name and year, and the button that searches for them; the
  /// keyboard's Search key does too.
  private var form: some View {
    let wide = isWide(window)
    let stacked = dynamicType.isAccessibilitySize
    let fields = Group {
      Field(label: Str.titleIdentifyName) {
        MatineeTextField($name)
          .textInputAutocapitalization(.words)
          .autocorrectionDisabled()
          .submitLabel(.search)
          .onSubmit(submit)
      }
      Field(label: Str.titleIdentifyYear) {
        // Digits and punctuation rather than the number pad, which has no Search key.
        MatineeTextField($year, placeholder: Str.titleIdentifyAnyYear)
          .keyboardType(.numbersAndPunctuation)
          .submitLabel(.search)
          .onSubmit(submit)
          .onChange(of: year) { _, typed in
            let digits = yearDigits(typed)
            if digits != typed { year = digits }
          }
      }
      .frame(width: stacked ? nil : yearWidth)
    }
    let button = MatineeButton(.secondary, action: submit) {
      LucideIcon(.search, size: 16)
      Text(Str.titleIdentifySearch)
    }
    return VStack(alignment: .leading, spacing: 12) {
      if stacked {
        VStack(alignment: .leading, spacing: 12) { fields }
        button.frame(maxWidth: .infinity)
      } else if wide {
        // A tablet's width has room for the button beside the fields.
        HStack(alignment: .bottom, spacing: 8) {
          fields
          button.padding(.bottom, 4)
        }
      } else {
        HStack(alignment: .bottom, spacing: 8) { fields }
        button
      }
    }
    .padding(.bottom, 12)
  }

  @ViewBuilder private func found(_ providerName: String?) -> some View {
    switch results {
    case .loading:
      LoadingBox().padding(32)
    case .failed(let message, _):
      Text(message).textStyle(.bodyMedium).foregroundStyle(palette.danger).padding(.horizontal, Gutter)
    case .ready(let matches) where matches.isEmpty:
      Text(Str.titleIdentifyEmpty(providerName ?? "", submitted.name))
        .textStyle(.bodyMedium).foregroundStyle(palette.muted)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, Gutter)
    case .ready(let matches):
      // Two to a row on a tablet, as its width leaves a phone's row mostly empty.
      let columns = isWide(window) ? 2 : 1
      LazyVGrid(
        columns: Array(repeating: GridItem(.flexible(), spacing: 16, alignment: .top), count: columns),
        alignment: .leading, spacing: 0
      ) {
        ForEach(matches, id: \.id) { match in
          MatchRow(
            match: match, current: isCurrentMatch(match, of: title), pending: matching?.id == match.id
          ) { pick(match) }
          .disabled(matching != nil)
        }
      }
      .padding(.horizontal, Gutter - 8)
    }
  }

  private func submit() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    error = nil
    submitted = IdentifyQuery(typed: name, year: year, fallback: title.name)
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
      results = .failed(describeFailure(error))
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
      snackbar.show(Str.titleIdentifyMatched(updated.name))
      nav.back()
    } catch {
      if Failure(error) == .cancelled || Task.isCancelled { return }
      self.error = describeFailure(error)
      matching = nil
    }
  }
}

/// A field's label above it.
private struct Field<Content: View>: View {
  let label: String
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label).textStyle(.labelMedium).foregroundStyle(palette.muted)
      content()
    }
  }
}

/// A provider's entry: its poster, name and year, whether it's the match
/// now, and what it's about.
private struct MatchRow: View {
  let match: MetadataMatch
  let current: Bool
  let pending: Bool
  let onPick: () -> Void
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .body) private var posterWidth: CGFloat = 48

  var body: some View {
    Button(action: onPick) {
      HStack(alignment: .top, spacing: 12) {
        Tone(match.id)
          .overlay { Picture(api?.art(match.poster)) }
          .frame(width: posterWidth, height: posterWidth * 3 / 2)
          .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        VStack(alignment: .leading, spacing: 2) {
          WrappingRow(spacing: 8, lineSpacing: 4) {
            Text(match.name).textStyle(.bodyLarge, weight: .medium).foregroundStyle(palette.foreground)
            if let year = match.year {
              Text(String(year)).textStyle(.bodyMedium).foregroundStyle(palette.muted)
            }
            if current { Badge(Str.titleIdentifyCurrent) }
          }
          if let overview = match.overview {
            Text(overview).textStyle(.bodySmall).foregroundStyle(palette.muted).lineLimit(2)
              .multilineTextAlignment(.leading)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if pending {
          ProgressView().tint(palette.accent).controlSize(.small)
        }
      }
      .padding(.vertical, 10)
      .padding(.horizontal, 8)
      .contentShape(ControlShape)
    }
    .buttonStyle(MatchPress())
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(current ? .isSelected : [])
  }
}

/// A row that tints when pressed, as Android's ripple on a clickable row.
private struct MatchPress: ButtonStyle {
  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(palette.foreground.opacity(configuration.isPressed ? 0.08 : 0), in: ControlShape)
      .opacity(enabled ? 1 : 0.6)
      .motion(Motion.color, value: configuration.isPressed)
  }
}

/// Views side by side, wrapping onto more lines as they need, each line's
/// views centred on each other: Compose's `FlowRow`. A view wider than the
/// row gets the row's width, so a long name wraps rather than runs off.
private struct WrappingRow: Layout {
  var spacing: CGFloat = 8
  var lineSpacing: CGFloat = 6

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    let lines = arrange(subviews, width: width)
    let used = lines.map(\.width).max() ?? 0
    let height = lines.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(lines.count - 1, 0))
    return CGSize(width: proposal.width.map { min($0, used) } ?? used, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for line in arrange(subviews, width: bounds.width) {
      var x = bounds.minX
      for (index, size) in zip(line.indices, line.sizes) {
        subviews[index].place(
          at: CGPoint(x: x, y: y + (line.height - size.height) / 2), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += line.height + lineSpacing
    }
  }

  private struct Line {
    var indices: [Int] = []
    var sizes: [CGSize] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Line] {
    var lines: [Line] = []
    var line = Line()
    for index in subviews.indices {
      var size = subviews[index].sizeThatFits(.unspecified)
      if size.width > width { size = subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil)) }
      if !line.indices.isEmpty && line.width + spacing + size.width > width {
        lines.append(line)
        line = Line()
      }
      line.width = line.indices.isEmpty ? size.width : line.width + spacing + size.width
      line.height = max(line.height, size.height)
      line.indices.append(index)
      line.sizes.append(size)
    }
    if !line.indices.isEmpty { lines.append(line) }
    return lines
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
    TitlePage(titleId: target.titleId, heading: Str.titleImagesTitle) { ImageEditor(title: $0, target: target) }
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
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @State private var slot: String
  @State private var images = Loader<[ItemImage]>()
  @State private var provider = Loader<MetadataProvider?>()
  @State private var allLanguages = false
  @State private var remote: Load<[RemoteImage]> = .loading
  @State private var remoteAttempt = 0
  @State private var busy: Change?
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
    FormPage {
      Text(
        providerName.map { Str.titleImagesDescription(name, $0) } ?? Str.titleImagesDescriptionLocal(name)
      )
      .textStyle(.bodyMedium).foregroundStyle(palette.muted)
      .padding(.horizontal, Gutter)
      .padding(.bottom, 16)
      if case .failed(let message, _) = images.state {
        VStack(alignment: .leading, spacing: 12) {
          Text(Str.titleImagesLoadError(message)).textStyle(.bodyMedium).foregroundStyle(palette.danger)
          RetryButton(action: images.reload)
        }
        .padding(.horizontal, Gutter)
      } else {
        slots(current, providerName: providerName)
          .padding(.bottom, 16)
        buttons(inUse, providerName: providerName, lists: lists)
          .padding(.horizontal, Gutter)
          .padding(.bottom, 16)
        candidates(inUse, providerName: providerName, lists: lists)
      }
    }
    .loads(images) { [target] api in
      try await api.titles.images(id: target.titleId, season: target.season, episode: target.episode)
    }
    .loads(provider) { [libraryId = title.libraryId] api in try await libraryProvider(api, libraryId) }
    .task(id: RemoteKey(slot: slot, allLanguages: allLanguages, lists: lists, attempt: remoteAttempt)) {
      guard lists else { return }
      await loadRemote()
    }
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
  }

  /// What the images are of: the title, a season of it, or an episode.
  private var name: String {
    guard let season = target.season else { return title.name }
    guard let episode = target.episode else { return Str.titleSeasonOf(title.name, seasonName(season)) }
    return Str.titleSeasonOf(
      title.name, season == 0 ? Str.mediaSpecial(episode) : Str.mediaEpisodeCode(season, episode))
  }

  /// Each slot with the image it has, which also picks the slot to change.
  /// Scrolls sideways when they don't fit.
  private func slots(_ current: [ItemImage]?, providerName: String?) -> some View {
    let several = target.slots.count > 1
    return ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(target.slots, id: \.self) { each in
          SlotCard(
            slot: each, current: current?.first { $0.slot == each }, toneKey: title.id,
            providerName: providerName, selected: several && each == slot,
            onSelect: several ? { withMotion(Motion.color) { slot = each } } : nil)
        }
      }
    }
    .contentMargins(.horizontal, Gutter, for: .scrollContent)
    .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
  }

  @ViewBuilder private func buttons(_ inUse: ItemImage?, providerName: String?, lists: Bool) -> some View {
    let offered = ImageButtons(inUse: inUse, lists: lists)
    VStack(alignment: .leading, spacing: 8) {
      if isWide(window) {
        HStack(spacing: 8) {
          uploadButton
          if offered.remove { removeButton }
          if offered.reset { resetButton(providerName ?? "") }
        }
      } else {
        // A phone's buttons fill the width: upload and remove side by
        // side, and going back to the provider's, whose name is long, on a
        // line of its own.
        HStack(spacing: 8) {
          uploadButton.frame(maxWidth: .infinity)
          if offered.remove { removeButton.frame(maxWidth: .infinity) }
        }
        if offered.reset { resetButton(providerName ?? "").frame(maxWidth: .infinity) }
      }
      if lists {
        Toggle(isOn: $allLanguages) {
          Text(Str.titleImagesAllLanguages).textStyle(.bodyMedium).foregroundStyle(palette.foreground)
        }
        .toggleStyle(.matinee)
        .frame(minHeight: MinTouch)
      }
    }
    .disabled(busy != nil)
  }

  /// Upload offers both of iOS's pickers, where Android has one: the photo
  /// library, which needs no permission, and Files.
  private var uploadButton: some View {
    Menu {
      Button(Str.iosImagesFromPhotos) { picking = true }
      Button(Str.iosImagesFromFiles) { importing = true }
    } label: {
      Busy(busy?.isUpload == true, icon: .imageUp)
      Text(Str.titleImagesUpload)
    }
    .menuStyle(.button)
    .buttonStyle(.matinee(.secondary, height: 40))
  }

  private var removeButton: some View {
    MatineeButton(.outline, height: 40) { change(.pick(nil)) } label: {
      Busy(busy == .pick(nil), icon: .trash)
      Text(Str.titleImagesRemove)
    }
  }

  private func resetButton(_ providerName: String) -> some View {
    MatineeButton(.outline, height: 40) { change(.reset) } label: {
      Busy(busy == .reset, icon: .rotateCcw)
      Text(Str.titleImagesReset(providerName))
    }
  }

  @ViewBuilder private func candidates(_ inUse: ItemImage?, providerName: String?, lists: Bool) -> some View {
    if provider.state.isLoading {
      LoadingBox().padding(32)
    } else if !lists {
      Note(text: providerName.map(Str.titleImagesUnmatched) ?? Str.titleImagesNoProvider)
    } else {
      switch remote {
      case .loading:
        LoadingBox().padding(32)
      case .failed(let message, _):
        VStack(alignment: .leading, spacing: 12) {
          Text(message).textStyle(.bodyMedium).foregroundStyle(palette.danger)
          RetryButton { remoteAttempt += 1 }
        }
        .padding(.horizontal, Gutter)
      case .ready(let found) where found.isEmpty:
        Note(
          text: allLanguages
            ? Str.titleImagesEmpty(providerName ?? "") : Str.titleImagesEmptyLanguage(providerName ?? ""))
      case .ready(let found):
        let columns = imageColumns(slot, width: window.width - 2 * Gutter)
        LazyVGrid(
          columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: columns),
          alignment: .leading, spacing: 16
        ) {
          ForEach(found, id: \.id) { image in
            Choice(
              image: image, slot: slot, toneKey: title.id, inUse: image.id == inUse?.image?.id,
              pending: busy == .pick(image.id)
            ) { change(.pick(image.id)) }
            .disabled(busy != nil)
          }
        }
        .padding(.horizontal, Gutter)
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
      remote = .failed(describeFailure(error))
    }
  }

  private func showError(_ message: String?) {
    snackbar.show([Str.titleImagesError, message].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: ": "))
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

/// A button's icon, or its spinner while what it does is out.
private struct Busy: View {
  let busy: Bool
  let icon: Lucide
  @Environment(\.palette) private var palette

  init(_ busy: Bool, icon: Lucide) {
    self.busy = busy
    self.icon = icon
  }

  var body: some View {
    if busy {
      ProgressView().controlSize(.small).tint(palette.foreground).frame(width: 16, height: 16)
    } else {
      LucideIcon(icon, size: 16)
    }
  }
}

/// Why there's nothing to pick, in the middle of the page.
private struct Note: View {
  let text: String
  @Environment(\.palette) private var palette

  var body: some View {
    Text(text).textStyle(.bodyMedium).foregroundStyle(palette.muted)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 32)
      .padding(.horizontal, Gutter)
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

/// A slot's image: a logo whole and clear of the edges, the rest filling the frame.
private struct SlotImage: View {
  let slot: String
  let source: ImageSource?
  let inset: CGFloat

  var body: some View {
    let logo = slot == ImageSlot.logo
    Picture(source, contentMode: logo ? .fit : .fill).padding(logo ? inset : 0)
  }
}

/// A slot's name and the image it has, all at one height whatever the
/// image's shape. Picks the slot when there are several.
private struct SlotCard: View {
  let slot: String
  let current: ItemImage?
  let toneKey: String
  let providerName: String?
  let selected: Bool
  let onSelect: (() -> Void)?
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .body) private var height: CGFloat = 56

  var body: some View {
    let state = current.map { stateText(ImageState(slot: slot, current: $0, providerName: providerName)) }
    let card = HStack(spacing: 12) {
      Tone(toneKey)
        .overlay { SlotImage(slot: slot, source: api?.art(current?.image, size: .thumb), inset: 4) }
        .frame(width: height * imageAspect(slot), height: height)
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
      VStack(alignment: .leading, spacing: 0) {
        Text(slotName(slot)).textStyle(.bodyMedium, weight: .medium).foregroundStyle(palette.foreground)
        Text(state ?? " ").textStyle(.bodySmall).foregroundStyle(palette.muted)
      }
      .lineLimit(1)
      .fixedSize()
    }
    .padding(6)
    .padding(.trailing, 10)
    .background(selected ? palette.accent.opacity(0.1) : .clear, in: ControlShape)
    .overlay { ControlShape.strokeBorder(selected ? palette.accent : palette.border) }
    .contentShape(ControlShape)
    if let onSelect {
      Button(action: onSelect) { card }
        .buttonStyle(RoundPress())
        .accessibilityAddTraits(selected ? .isSelected : [])
    } else {
      card.accessibilityElement(children: .combine)
    }
  }
}

/// One of the provider's images: the picture, a tick on the one in use,
/// and its size and language.
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
    Button(action: onPick) {
      VStack(alignment: .leading, spacing: 6) {
        Tone(toneKey)
          .aspectRatio(imageAspect(slot), contentMode: .fit)
          .frame(maxWidth: .infinity)
          .overlay { SlotImage(slot: slot, source: api?.art(image.preview), inset: 8) }
          .overlay {
            if pending {
              Color.black.opacity(0.5)
              ProgressView().tint(.white)
            }
          }
          .clipShape(ControlShape)
          .overlay { ControlShape.strokeBorder(inUse ? palette.accent : palette.border, lineWidth: inUse ? 2 : 1) }
          .overlay(alignment: .topTrailing) {
            if inUse {
              LucideIcon(.check, size: 14, tint: palette.accentForeground, scales: false)
                .frame(width: 20, height: 20)
                .background(palette.accent, in: Circle())
                .padding(6)
            }
          }
        // A line each, as three posters to a row leave no room for both on one.
        VStack(alignment: .leading, spacing: 0) {
          ForEach(lines, id: \.self) { line in
            Text(line).textStyle(.bodySmall).foregroundStyle(palette.muted).lineLimit(1)
          }
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(RoundPress())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(lines.joined(separator: ", "))
    .accessibilityValue(inUse ? Str.titleImagesInUse : "")
    .accessibilityHint(inUse ? "" : Str.titleImagesUse)
    .accessibilityAddTraits(inUse ? .isSelected : [])
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
