#if os(tvOS)
  import SwiftUI

  /// Sizes of TV cards and the room around them: Android TV's at two points a dp.
  public enum TVCards {
    /// A poster's width, 2:3. Six and a bit fit past the drawer's rail, as on
    /// Android TV, and Apple's own catalog sample has 250.
    public static let posterWidth: CGFloat = 248
    /// A still's width, 16:9.
    public static let landscapeWidth: CGFloat = 448
    /// Between cards in a row.
    public static let gap: CGFloat = 40
    public static let radius: CGFloat = TVRadius.card
    /// A row's heading, one line of `.title`, fixed so a page knows where the cards start.
    public static let titleHeight: CGFloat = 52
    /// Between a row's heading and its cards, room for the focused card's lift included.
    public static let titleGap: CGFloat = 24

    public static var shape: RoundedRectangle { .kit(radius) }
  }

  /// A picture from `url`, filling its frame, fading in over what's behind
  /// it once loaded; nothing while it loads or when it fails, so the card's
  /// own stand-in shows. The kit's only loader, for a caller with no image
  /// pipeline of its own; a card takes any view as its art.
  public struct TVPicture: View {
    let url: URL?
    let contentMode: ContentMode
    let alignment: Alignment

    public init(_ url: URL?, contentMode: ContentMode = .fill, alignment: Alignment = .center) {
      self.url = url
      self.contentMode = contentMode
      self.alignment = alignment
    }

    public var body: some View {
      AsyncImage(url: url, transaction: Transaction(animation: Motion.image)) { phase in
        if let image = phase.image {
          image.resizable().aspectRatio(contentMode: contentMode)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .transition(.opacity)
        }
      }
      .clipped()
      .accessibilityHidden(true)
    }
  }

  /// The tone a card shows until its picture is in, the same for the same
  /// `key`, from the palette's art tones.
  struct TVTone: View {
    let key: String
    @Environment(\.palette) private var palette

    var body: some View {
      let tones = palette.tones
      let index = key.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF } % tones.count
      LinearGradient(colors: [tones[index].0, tones[index].1], startPoint: .top, endPoint: .bottom)
    }
  }

  /// A card's picture as the focus target, `aspect` wide to high: `art`
  /// over a tone, with the TV's picture focus. Select runs `action`, a long
  /// press `onLongPress`, as for the actions panel, and Play/Pause
  /// `onPlayPause`. Put a caption, if any, outside it, so only the picture
  /// lifts.
  public struct TVArtCard<Art: View>: View {
    let toneKey: String
    let aspect: CGFloat
    let label: String?
    let action: () -> Void
    let onLongPress: (() -> Void)?
    let onPlayPause: (() -> Void)?
    @ViewBuilder let art: () -> Art

    public init(
      toneKey: String, aspect: CGFloat, label: String? = nil, action: @escaping () -> Void,
      onLongPress: (() -> Void)? = nil, onPlayPause: (() -> Void)? = nil, @ViewBuilder art: @escaping () -> Art
    ) {
      self.toneKey = toneKey
      self.aspect = aspect
      self.label = label
      self.action = action
      self.onLongPress = onLongPress
      self.onPlayPause = onPlayPause
      self.art = art
    }

    public var body: some View {
      TVPictureButton(shape: TVCards.shape, action: action, onLongPress: onLongPress, onPlayPause: onPlayPause) {
        Color.clear
          .aspectRatio(aspect, contentMode: .fit)
          .background { TVTone(key: toneKey) }
          .overlay { art() }
      }
      .accessibilityLabel(label ?? "")
    }
  }

  /// A movie or show as its 2:3 poster, `name` on the tone until the
  /// picture is in, and the watched dot at its corner. Select opens it;
  /// `onLongPress` and `onPlayPause` are as on `TVArtCard`.
  ///
  ///     TVPosterCard("Dune", url: poster) { open(title) }
  public struct TVPosterCard<Art: View>: View {
    let name: String
    let watched: Bool
    let width: CGFloat?
    let action: () -> Void
    let onLongPress: (() -> Void)?
    let onPlayPause: (() -> Void)?
    @ViewBuilder let art: () -> Art
    @Environment(\.palette) private var palette

    /// `width` nil fills what it's given, as in a grid's column.
    public init(
      _ name: String, watched: Bool = false, width: CGFloat? = TVCards.posterWidth, action: @escaping () -> Void,
      onLongPress: (() -> Void)? = nil, onPlayPause: (() -> Void)? = nil, @ViewBuilder art: @escaping () -> Art
    ) {
      self.name = name
      self.watched = watched
      self.width = width
      self.action = action
      self.onLongPress = onLongPress
      self.onPlayPause = onPlayPause
      self.art = art
    }

    public var body: some View {
      TVArtCard(
        toneKey: name, aspect: 2 / 3, label: name, action: action, onLongPress: onLongPress, onPlayPause: onPlayPause
      ) {
        ZStack(alignment: .topTrailing) {
          Text(name).textStyle(.label).foregroundStyle(palette.foreground.opacity(0.75))
            .multilineTextAlignment(.center).lineLimit(4)
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
          art()
          if watched { TVWatchedMark().padding(16) }
        }
      }
      .frame(width: width)
    }
  }

  extension TVPosterCard where Art == TVPicture {
    /// A poster loaded from `url`.
    public init(
      _ name: String, url: URL?, watched: Bool = false, width: CGFloat? = TVCards.posterWidth,
      action: @escaping () -> Void, onLongPress: (() -> Void)? = nil, onPlayPause: (() -> Void)? = nil
    ) {
      self.init(
        name, watched: watched, width: width, action: action, onLongPress: onLongPress, onPlayPause: onPlayPause
      ) { TVPicture(url) }
    }
  }

  /// A file as a 16:9 still, for Continue watching and Next up: how far in
  /// it is along its bottom, or the watched dot, and `caption` and `detail`
  /// under it. Only the still takes focus.
  ///
  ///     TVLandscapeCard("Severance", detail: "S2 · E4 · 18 min left", progress: 0.6, url: still) { play() }
  public struct TVLandscapeCard<Art: View>: View {
    let caption: String
    let detail: String?
    let progress: Double?
    let watched: Bool
    let width: CGFloat?
    let action: () -> Void
    let onLongPress: (() -> Void)?
    let onPlayPause: (() -> Void)?
    @ViewBuilder let art: () -> Art
    @Environment(\.palette) private var palette

    public init(
      _ caption: String, detail: String? = nil, progress: Double? = nil, watched: Bool = false,
      width: CGFloat? = TVCards.landscapeWidth, action: @escaping () -> Void, onLongPress: (() -> Void)? = nil,
      onPlayPause: (() -> Void)? = nil, @ViewBuilder art: @escaping () -> Art
    ) {
      self.caption = caption
      self.detail = detail
      self.progress = progress
      self.watched = watched
      self.width = width
      self.action = action
      self.onLongPress = onLongPress
      self.onPlayPause = onPlayPause
      self.art = art
    }

    public var body: some View {
      VStack(alignment: .leading, spacing: 0) {
        TVArtCard(
          toneKey: caption, aspect: 16 / 9, label: [caption, detail].compactMap { $0 }.joined(separator: ", "),
          action: action, onLongPress: onLongPress, onPlayPause: onPlayPause
        ) {
          ZStack(alignment: .bottom) {
            art()
            if watched {
              TVWatchedMark().padding(16).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            } else if let progress, progress > 0 {
              TVProgress(progress).padding(20)
            }
          }
        }
        Text(caption).textStyle(.label).lineLimit(1)
          .padding(.top, TVFocus.captionGap)
        if let detail {
          Text(detail).textStyle(.caption).foregroundStyle(palette.mutedForeground).lineLimit(1)
        }
      }
      .frame(width: width, alignment: .leading)
    }
  }

  extension TVLandscapeCard where Art == TVPicture {
    /// A still loaded from `url`.
    public init(
      _ caption: String, detail: String? = nil, progress: Double? = nil, watched: Bool = false, url: URL?,
      width: CGFloat? = TVCards.landscapeWidth, action: @escaping () -> Void, onLongPress: (() -> Void)? = nil,
      onPlayPause: (() -> Void)? = nil
    ) {
      self.init(
        caption, detail: detail, progress: progress, watched: watched, width: width, action: action,
        onLongPress: onLongPress, onPlayPause: onPlayPause
      ) { TVPicture(url) }
    }
  }

  /// How far into a file the person is: the accent on a dark track.
  public struct TVProgress: View {
    let value: Double
    @Environment(\.palette) private var palette
    @Environment(\.locale) private var locale

    public init(_ value: Double) { self.value = value }

    public var body: some View {
      let shown = min(max(value, 0), 1)
      Capsule().fill(.black.opacity(0.5))
        .overlay(alignment: .leading) {
          GeometryReader { proxy in
            Capsule().fill(palette.accent).frame(width: max(10, proxy.size.width * shown))
          }
        }
        .clipShape(Capsule())
        .frame(height: 10)
        .accessibilityElement()
        .accessibilityLabel(TVText.progress(shown.formatted(.percent.precision(.fractionLength(0))), locale))
    }
  }

  /// The accent's dot on something watched.
  public struct TVWatchedMark: View {
    @Environment(\.palette) private var palette
    @Environment(\.locale) private var locale

    public init() {}

    public var body: some View {
      Circle().fill(palette.accent)
        .frame(width: 24, height: 24)
        .shadow(color: .black.opacity(0.35), radius: 4, y: 1)
        .accessibilityLabel(TVText.watched(locale))
    }
  }

  /// An item with the key a row or grid knows it by.
  struct Keyed<Item>: Identifiable {
    let id: String
    let item: Item
  }

  /// A titled row of cards that scrolls sideways, for a page of rows like
  /// Home. Cards pass out of sight just right of the drawer's rail and at
  /// the screen's right edge, and the focused card stays clear of both. The
  /// row is a focus section of `memory` under `key`: focus coming back lands
  /// on the card it left. Each item is keyed by `itemKey`.
  ///
  ///     TVRow("Continue watching", key: "continue", items: items, itemKey: \.id, memory: memory) { item in
  ///       TVLandscapeCard(item.name, ...) { play(item) }
  ///     }
  public struct TVRow<Item, Card: View>: View {
    let title: String?
    let key: String
    let items: [Item]
    let itemKey: (Item) -> String
    let memory: TVFocusMemory
    let spacing: CGFloat
    @ViewBuilder let card: (Item) -> Card
    @FocusState private var focused: String?

    public init(
      _ title: String?, key: String, items: [Item], itemKey: @escaping (Item) -> String, memory: TVFocusMemory,
      spacing: CGFloat = TVCards.gap, @ViewBuilder card: @escaping (Item) -> Card
    ) {
      self.title = title
      self.key = key
      self.items = items
      self.itemKey = itemKey
      self.memory = memory
      self.spacing = spacing
      self.card = card
    }

    public var body: some View {
      VStack(alignment: .leading, spacing: TVCards.titleGap) {
        if let title {
          Text(title).textStyle(.title).lineLimit(1)
            .frame(height: TVCards.titleHeight, alignment: .leading)
            .padding(.leading, TVPage.start)
            .padding(.trailing, TVPage.end)
            .accessibilityAddTraits(.isHeader)
        }
        ScrollView(.horizontal) {
          LazyHStack(alignment: .top, spacing: spacing) {
            ForEach(items.map { Keyed(id: itemKey($0), item: $0) }) { keyed in
              card(keyed.item).focused($focused, equals: keyed.id)
            }
          }
          .padding(.horizontal, TVFocus.room)
          .padding(.vertical, TVFocus.room)
          .padding(.trailing, TVPage.end)
        }
        .scrollIndicators(.hidden)
        // Cards go out of sight just right of the drawer's rail, the room for the focused one's lift away from the page's start.
        .padding(.leading, TVPage.start - TVFocus.room)
        .padding(.vertical, -TVFocus.room)
        .tvFocusRow(key, memory: memory, focused: $focused, first: items.first.map(itemKey))
      }
      .id(key)
    }
  }
#endif
