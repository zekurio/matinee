import MatineeCore
import MatineeKit
import SwiftUI

/*
 * The featured titles at the top of Home, in Hero.kt's place, after
 * Findroid's HomeCarousel.kt and HomeCarouselItem.kt: a row of cards that
 * swipes sideways, each the title's backdrop under a dark shade with its
 * genres and its name typed out. How many share the row, where it rests,
 * where the advance goes next, and the genres line are MatineeCore's
 * `FeaturedCarousel` and `FeaturedTitle.cardLine` (Home/), where they're
 * tested. Debug stand-ins are HomeCarouselDevData.swift's.
 */

/// The sizes the carousel lays its cards out by, for a row `rowWidth`
/// wide: one card on a phone, with the next one's edge showing at the
/// right; two from 600 points, three from 840, filling the row between the
/// page's margins. Cards are 16:9, and no taller than 40% of the window, so
/// one title alone on a wide iPad is a wide band rather than most of the
/// screen.
struct CarouselLayout {
  let perRow: Int
  let stops: Int
  let gap: CGFloat
  let cardWidth: CGFloat
  let cardHeight: CGFloat

  init(rowWidth: CGFloat, window: CGSize, gutter: CGFloat, count: Int) {
    perRow = FeaturedCarousel.perRow(width: window.width, count: count)
    stops = FeaturedCarousel.stops(count: count, perRow: perRow)
    // The rails' gap, so the row reads as one of Home's.
    gap = isWide(window) ? Space.s4 : Space.s3
    let inner = max(rowWidth - 2 * gutter, 0)
    if perRow == 1 {
      // One to a row: as much narrower as the gap, so the next card shows
      // as wide a strip as the margin at the right.
      cardWidth = count > 1 ? max(inner - gap, 0) : inner
    } else {
      cardWidth = max((inner - gap * CGFloat(perRow - 1)) / CGFloat(perRow), 0)
    }
    cardHeight = min(cardWidth * 9 / 16, window.height * 0.4)
  }

  /// How far one card is from the next.
  var stride: CGFloat { cardWidth + gap }
}

/// Home's featured titles as a row of cards. A tap opens the title, a long
/// press its actions, Play among them. It moves on to the next card every
/// five seconds and back to the first after the last; not while a finger
/// is on it, a card's actions are open, VoiceOver is on, or under Reduce
/// Motion. On an iPad, previous and next buttons beside the dots step it.
struct HomeCarousel: View {
  let slides: [FeaturedTitle]

  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter
  @Environment(\.shellStyle) private var style
  @Environment(\.actions) private var actions
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @State private var position = ScrollPosition(idType: Int.self)
  /// The row's width, which the cards share; the window's until measured.
  @State private var rowWidth: CGFloat?
  /// Where the row rests nearest, which the dots follow.
  @State private var stop = 0
  /// Where it last came to rest, which the advance waits on.
  @State private var settled = 0
  @State private var dragging = false
  /// A debug launch that opens it somewhere holds it there.
  private var held: Bool { HomeCarouselDevData.startStop != nil }

  var body: some View {
    let layout = CarouselLayout(
      rowWidth: rowWidth ?? window.width, window: window, gutter: gutter, count: slides.count)
    let paused = dragging || held || reduceMotion || voiceOver || actions?.target != nil || layout.stops < 2
    VStack(spacing: Space.s3) {
      ScrollView(.horizontal) {
        LazyHStack(alignment: .top, spacing: layout.gap) {
          ForEach(slides.indices, id: \.self) { index in
            FeaturedCard(
              slide: slides[index], index: index, count: slides.count,
              width: layout.cardWidth, height: layout.cardHeight)
          }
        }
        .scrollTargetLayout()
        .offset(x: -HomeCarouselDevData.swipe * layout.stride)
      }
      .contentMargins(.horizontal, gutter, for: .scrollContent)
      .scrollTargetBehavior(.viewAligned(limitBehavior: .always))
      .scrollIndicators(.hidden)
      .scrollPosition($position)
      .onScrollGeometryChange(for: Int.self) { geometry in
        FeaturedCarousel.stop(
          offset: geometry.contentOffset.x + geometry.contentInsets.leading, stride: layout.stride,
          stops: layout.stops)
      } action: { _, value in
        stop = value
      }
      .onScrollPhaseChange { _, phase in
        dragging = phase == .interacting
        if phase == .idle { settled = stop }
      }
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { rowWidth = $0 }
      .task(id: Advance(stop: settled, paused: paused)) {
        guard !paused else { return }
        try? await Task.sleep(for: FeaturedCarousel.advance)
        guard !Task.isCancelled else { return }
        go(to: FeaturedCarousel.next(after: settled, stops: layout.stops), animation: Motion.easing(0.6))
      }
      .task(id: layout.stride) { startWhereAsked(layout) }
      .task {
        // `-dev.featuredOpen actions`, in a debug build: the first card's long press.
        guard HomeCarouselDevData.opensActions, let first = slides.first else { return }
        try? await Task.sleep(for: .seconds(1))
        actions?.open(featuredTarget(first))
      }

      if layout.stops > 1 {
        pager(layout)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.tvHomeFeatured)
    // A keyboard on an iPad steps through the cards with the arrows.
    .focusable()
    .focusEffectDisabled()
    .onKeyPress(.leftArrow) { step(-1, layout) }
    .onKeyPress(.rightArrow) { step(1, layout) }
  }

  /// The dots, and on an iPad, where a pointer can't swipe, previous and next.
  @ViewBuilder private func pager(_ layout: CarouselLayout) -> some View {
    if style == .tablet {
      HStack(spacing: Space.s2) {
        PageDots(count: layout.stops, current: stop)
        Spacer(minLength: 0)
        RoundIconButton(.chevronLeft, label: Str.iosMediaHeroPrevious, look: .ghost, size: 36) {
          _ = step(-1, layout)
        }
        RoundIconButton(.chevronRight, label: Str.iosMediaHeroNext, look: .ghost, size: 36) {
          _ = step(1, layout)
        }
      }
      .padding(.horizontal, gutter)
    } else {
      PageDots(count: layout.stops, current: stop)
    }
  }

  private func step(_ by: Int, _ layout: CarouselLayout) -> KeyPress.Result {
    guard layout.stops > 1 else { return .ignored }
    let target =
      by > 0
      ? FeaturedCarousel.next(after: stop, stops: layout.stops)
      : FeaturedCarousel.previous(before: stop, stops: layout.stops)
    go(to: target, animation: Motion.move)
    return .handled
  }

  private func go(to target: Int, animation: Animation) {
    withMotion(animation) { position.scrollTo(id: target, anchor: .leading) }
    settled = target
  }

  /// `-dev.featuredStop`, in a debug build: resting at a card, or part of
  /// the way to the next one, as a swipe leaves it.
  private func startWhereAsked(_ layout: CarouselLayout) {
    guard let start = HomeCarouselDevData.startStop, layout.stride > 0 else { return }
    position.scrollTo(x: start.rounded(.down) * layout.stride - gutter)
  }
}

private struct Advance: Equatable {
  let stop: Int
  let paused: Bool
}

/// One featured title: its backdrop at 16:9 under a dark shade, the same in
/// light and dark, and over it at the bottom its genres, then its name, in
/// white. The card says nothing else; its actions and its page carry the
/// rest. To VoiceOver it's one button: the name, then the genres and where
/// it is in the row.
private struct FeaturedCard: View {
  let slide: FeaturedTitle
  let index: Int
  let count: Int
  let width: CGFloat
  let height: CGFloat

  @Environment(\.navigator) private var nav
  @Environment(\.actions) private var actions
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    let shape = RoundedRectangle.kit(Radius.xl)
    let line = slide.cardLine()
    let art = FeaturedArtwork(slide: slide, index: index)
    Pressable(
      shape: shape, action: { if !offline { nav.title(slide.title) } }, onLongPress: longPress,
      longPressLabel: Str.titleMoreActions
    ) {
      VStack(alignment: .leading, spacing: Space.s1) {
        if let line {
          Text(line)
            .textStyle(.px13, weight: .medium)
            .foregroundStyle(Color.white.opacity(0.8))
            .lineLimit(1)
        }
        Text(slide.title.name)
          .textStyle(width >= 560 ? .px28 : .px22, weight: .semibold, tracking: .tight)
          .foregroundStyle(Color.white)
          // A third line at the accessibility sizes, for which the card grows.
          .lineLimit(dynamicType.isAccessibilitySize ? 3 : 2)
          .multilineTextAlignment(.leading)
      }
      .pictureShadow()
      .padding(Space.s4)
      // Clear of the poster, when the title has only that.
      .padding(.trailing, art.posterOnly ? posterWidth : 0)
      .frame(width: width, alignment: .bottomLeading)
      // The card's height, or taller when large text needs it.
      .frame(minHeight: height, alignment: .bottomLeading)
      .background { art.frame(width: width) }
      .clipShape(shape)
      .overlay { shape.strokeBorder(palette.hairline) }
      .contentShape(shape)
    }
    .accessibilityLabel(slide.title.name)
    .accessibilityValue(
      [line, Str.iosHomeFeaturedPosition(index + 1, count)].compactMap(\.self).joined(separator: ", "))
  }

  /// The poster's width beside the text, with its margin.
  private var posterWidth: CGFloat { (height - 2 * Space.s3) * 2 / 3 + Space.s3 }

  private var longPress: (() -> Void)? {
    guard let actions, !offline else { return nil }
    let target = featuredTarget(slide)
    return { actions.open(target) }
  }
}

/// What a card's long press opens: the title's actions, Play first. A
/// movie's file is the movie, which the sheet can download; a show's is
/// worked out by the sheet.
private func featuredTarget(_ slide: FeaturedTitle) -> ActionTarget {
  .title(slide.title, file: slide.title.isShow ? nil : slide.item, here: false)
}

/// A card's picture and its shade. The backdrop, or a show's episode still,
/// or a frame from the file; a title with only a poster gets the poster
/// whole at the right over a blur of itself; with nothing, the title's tone.
/// The shade is after Findroid's, black from 10% at the top, whatever the
/// theme, so the words on it are always white on dark; lighter than its
/// through the middle, to show more of the picture, and darker than its at
/// the bottom, 60% where the genres sit and 80% at the edge, which a snowy
/// or busy picture needs under small text.
private struct FeaturedArtwork: View {
  let slide: FeaturedTitle
  let index: Int
  @Environment(\.api) private var api

  private enum Art {
    case wide([ImageSource])
    case poster(ImageSource)
    case none
  }

  private var art: Art {
    if let stand = HomeCarouselDevData.art(index) {
      switch stand {
      case .backdrop(let source): return .wide([source])
      case .poster(let source): return .poster(source)
      case .none: return .none
      }
    }
    if let stand = HomeDevData.backdrop(slide) { return .wide(stand) }
    let title = slide.title
    let wide = [api?.art(title.images.backdrop, size: .large), api?.art(slide.item.episode?.still, size: .large)]
      .compactMap(\.self)
    let frame = api?.frame(slide.item.id, large: true)
    if !wide.isEmpty { return .wide(wide + [frame].compactMap(\.self)) }
    if let poster = api?.art(title.images.poster, size: .medium) { return .poster(poster) }
    return frame.map { .wide([$0]) } ?? .none
  }

  var posterOnly: Bool {
    if case .poster = art { return true }
    return false
  }

  var body: some View {
    ZStack {
      Tone(slide.title.name)
      switch art {
      case .wide(let sources):
        Picture(sources)
      case .poster(let source):
        Picture(source).blur(radius: 24).scaleEffect(1.2)
        GeometryReader { proxy in
          let height = proxy.size.height - 2 * Space.s3
          Picture(source)
            .frame(width: height * 2 / 3, height: height)
            .clipShape(RoundedRectangle.kit(Radius.md))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
            .padding(.trailing, Space.s3)
        }
      case .none:
        EmptyView()
      }
      LinearGradient(
        stops: [
          .init(color: .black.opacity(0.1), location: 0),
          .init(color: .black.opacity(0.3), location: 0.4),
          .init(color: .black.opacity(0.6), location: 0.7),
          .init(color: .black.opacity(0.8), location: 1),
        ], startPoint: .top, endPoint: .bottom)
    }
    .accessibilityHidden(true)
  }
}

/// The carousel's place while the featured titles load: its cards as they'll sit.
struct HomeCarouselSkeleton: View {
  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter
  @State private var rowWidth: CGFloat?

  var body: some View {
    let layout = CarouselLayout(rowWidth: rowWidth ?? window.width, window: window, gutter: gutter, count: 6)
    HStack(spacing: layout.gap) {
      ForEach(0..<layout.perRow + 1, id: \.self) { _ in
        Skeleton(radius: Radius.xl).frame(width: layout.cardWidth, height: layout.cardHeight)
      }
    }
    .padding(.leading, gutter)
    // The row's width, not the cards': they run past it, clipped.
    .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
    .clipped()
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { rowWidth = $0 }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Str.loadingInProgress)
  }
}
