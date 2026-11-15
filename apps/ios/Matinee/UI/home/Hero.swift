import MatineeCore
import MatineeKit
import Nuke
import NukeUI
import SwiftUI

/*
 * Hero.kt, after the web's hero.tsx: the banner at the top of Home. Its
 * paging, how tall it is, and which facts a slide lists are MatineeCore's
 * `HeroPaging`, `heroHeight`, and `FeaturedTitle` helpers (Home/), where
 * they're tested.
 */

/// The banner at the top of Home: new and well-rated titles over their art,
/// with Play starting where the person is in each. It advances on its own
/// until the person swipes it, always forward: the pages repeat, so after
/// the last comes the first again rather than a rewind through them all.
/// Under Reduce Motion it stays where the person put it.
///
/// `topInset` is how far down the screen's top the page's content starts,
/// the status bar's height and on an iPad the tabs', which the art reaches
/// under; `top` is Home's header, which lies over it there.
struct Hero<Top: View>: View {
  let slides: [FeaturedTitle]
  let height: CGFloat
  let topInset: CGFloat
  @ViewBuilder let top: () -> Top

  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var position: ScrollPosition
  /// The page it last came to rest on, which the advance waits on.
  @State private var settled: Int
  /// The page nearest the middle, which the buttons and dots follow.
  @State private var current: Int
  /// A swipe holds the banner on what the person picked.
  @State private var held = false
  /// How tall the buttons are, which a slide's text leaves free.
  @State private var buttonsHeight: CGFloat = 44
  /// The safe area's sides, as a phone on its side has: the art spans the
  /// width, and the text keeps inside them.
  @State private var sides = EdgeInsets()

  init(slides: [FeaturedTitle], height: CGFloat, topInset: CGFloat, @ViewBuilder top: @escaping () -> Top) {
    self.slides = slides
    self.height = height
    self.topInset = topInset
    self.top = top
    let first = HeroPaging.initialPage(slides.count)
    _position = State(initialValue: ScrollPosition(id: first))
    _settled = State(initialValue: first)
    _current = State(initialValue: first)
  }

  var body: some View {
    let count = slides.count
    let loops = count > 1
    let wide = heroIsWide(width: window.width, height: window.height)
    let bottom = heroBottom(wide: wide)
    ScrollView(.horizontal) {
      LazyHStack(alignment: .top, spacing: 0) {
        ForEach(0..<HeroPaging.pages(count), id: \.self) { page in
          Slide(
            slide: slides[HeroPaging.slide(page, count: count)], wide: wide, topInset: topInset,
            sides: sides, reserved: bottom + buttonsHeight + Space.s3_5
          )
          .frame(height: height)
          .containerRelativeFrame(.horizontal)
          // The pages beside it are laid out for the swipe, but not there to read.
          .accessibilityHidden(page != current)
        }
      }
      .scrollTargetLayout()
    }
    .frame(height: height)
    .scrollPosition($position)
    .scrollTargetBehavior(.paging)
    .scrollIndicators(.hidden)
    .onScrollGeometryChange(for: Int.self) { geometry in
      Int((geometry.contentOffset.x / max(geometry.containerSize.width, 1)).rounded())
    } action: { _, page in
      current = page
    }
    // Only a drag counts: the banner's own advance scrolls too.
    .onScrollPhaseChange { _, phase in
      if phase == .interacting { held = true }
      if phase == .idle { settled = current }
    }
    // Waits on the page it settled on, so the advance's own scroll doesn't cancel it.
    .task(id: AdvanceKey(page: settled, held: held || reduceMotion)) {
      guard loops, !held, !reduceMotion else { return }
      try? await Task.sleep(for: HeroPaging.advance)
      guard !Task.isCancelled else { return }
      withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.5)) { position.scrollTo(id: settled + 1) }
    }
    // The art reaches the screen's edges; the overlays below keep inside the safe area.
    .ignoresSafeArea(edges: .horizontal)
    .onGeometryChange(for: EdgeInsets.self) { $0.safeAreaInsets } action: { sides = $0 }
    .overlay(alignment: .bottom) {
      HStack(alignment: .center, spacing: Space.s4) {
        HeroButtons(slide: slides[HeroPaging.slide(current, count: count)], wide: wide)
        if loops && wide {
          Spacer(minLength: 0)
          dots(count: count)
          arrows(count: count)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      // The overlay keeps inside the safe area's sides itself, as the slides' text does.
      .padding(.horizontal, gutter)
      .padding(.bottom, bottom)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { buttonsHeight = $0 - bottom }
    }
    .overlay(alignment: .top) { top() }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.tvHomeFeatured)
    // VoiceOver swipes up and down to change slides, as a carousel takes.
    .accessibilityAdjustableAction { direction in
      switch direction {
      case .increment: _ = step(1)
      case .decrement: _ = step(-1)
      @unknown default: break
      }
    }
    // A keyboard on an iPad steps through the slides with the arrows.
    .focusable()
    .focusEffectDisabled()
    .onKeyPress(.leftArrow) { step(-1) }
    .onKeyPress(.rightArrow) { step(1) }
  }

  private func step(_ by: Int) -> KeyPress.Result {
    guard slides.count > 1 else { return .ignored }
    held = true
    withMotion(Motion.move) { position.scrollTo(id: current + by) }
    return .handled
  }

  /// Which slide shows, the open one longer, as the web's dots: each a
  /// button to its slide.
  private func dots(count: Int) -> some View {
    let active = HeroPaging.slide(current, count: count)
    return HStack(spacing: 0) {
      ForEach(0..<count, id: \.self) { index in
        let on = index == active
        HeroDot(on: on, label: Str.mediaHeroShowSlide(index + 1)) {
          held = true
          // The nearest page showing that slide.
          withMotion(Motion.move) {
            position.scrollTo(id: HeroPaging.page(showing: index, from: current, count: count))
          }
        }
      }
    }
    .motion(Motion.move, value: active)
  }

  /// The web's previous and next, beside the dots on a wide banner.
  private func arrows(count: Int) -> some View {
    let slide = HeroPaging.slide(current, count: count)
    // TODO(strings): media_hero_previous and media_hero_next, the web's
    // media.hero.previous and media.hero.next ("Previous slide", "Next slide"),
    // which Android doesn't have yet; meanwhile they name the slide they show.
    return HStack(spacing: Space.s1) {
      RoundIconButton(
        .chevronLeft, label: Str.mediaHeroShowSlide(HeroPaging.slide(slide - 1, count: count) + 1), look: .ghost,
        size: TouchTarget
      ) { _ = step(-1) }
      RoundIconButton(
        .chevronRight, label: Str.mediaHeroShowSlide(HeroPaging.slide(slide + 1, count: count) + 1), look: .ghost,
        size: TouchTarget
      ) { _ = step(1) }
    }
  }
}

private struct AdvanceKey: Equatable {
  let page: Int
  let held: Bool
}

/// One of the banner's dots.
private struct HeroDot: View {
  let on: Bool
  let label: String
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Pressable(shape: Capsule(), wash: false, action: action) {
      Capsule()
        .fill(on ? palette.foreground : palette.foreground.opacity(0.4))
        .frame(width: on ? 20 : 6, height: 6)
        .padding(.horizontal, Space.s1_5)
        .frame(minHeight: TouchTarget)
        .contentShape(Rectangle())
    }
    .accessibilityLabel(label)
    .accessibilityAddTraits(on ? .isSelected : [])
  }
}

/// Space under the banner's buttons: room on a wide banner, little on a phone.
private func heroBottom(wide: Bool) -> CGFloat { wide ? Space.s8 : Space.s3 }

/// One slide. Its art holds still and crossfades with the next one's as the
/// pages move, as the web's banner does, rather than the pictures sliding
/// edge to edge; its text slides with the page.
private struct Slide: View {
  let slide: FeaturedTitle
  let wide: Bool
  let topInset: CGFloat
  let sides: EdgeInsets
  /// Room left at the bottom for the buttons, which stay while the slides swipe.
  let reserved: CGFloat

  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter

  var body: some View {
    let title = slide.title
    let item = slide.item
    let ratio = progressRatio(item)
    let left = timeLeft(item)
    let resuming = left != nil && ratio != nil
    VStack(alignment: .leading, spacing: 0) {
      TitleMark(slide: slide, wide: wide).frame(maxWidth: 512, alignment: .leading)
      facts(title)
        .padding(.top, Space.s3)
      if slide.showsGenres(wide: wide, resuming: resuming) {
        FlowRow(spacing: Space.s1_5, lineSpacing: Space.s1_5) {
          ForEach(slide.shownGenres, id: \.self) { genre in
            GenreChip(genre) { nav.genre(genre) }
          }
        }
        .padding(.top, Space.s3)
      }
      if wide, let overview = title.overview {
        Text(overview)
          .textStyle(.sm)
          .lineSpacing(4)
          .foregroundStyle(palette.foreground.opacity(0.7))
          .lineLimit(3)
          .frame(maxWidth: 576, alignment: .leading)
          .padding(.top, Space.s2)
      }
      if resuming, let ratio, let left {
        HStack(spacing: Space.s3) {
          ProgressBar(ratio, height: 4, track: palette.foreground.opacity(0.25), fill: palette.foreground)
            .accessibilityHidden(true)
          Text(episodeCode(item).map { "\($0) · \(left)" } ?? left)
            .textStyle(.xs)
            .foregroundStyle(palette.foreground.opacity(0.8))
            .lineLimit(1)
            .fixedSize()
        }
        .frame(maxWidth: 320)
        .padding(.top, wide ? Space.s4 : Space.s3)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    .padding(.leading, gutter + sides.leading)
    .padding(.trailing, gutter + sides.trailing)
    // Clear of the header at the top, which is the status bar's and 56 more.
    .padding(.top, topInset + 56)
    .padding(.bottom, reserved)
    .background { art }
  }

  /// The year and episode count, the age rating, and the score, in a line
  /// that wraps.
  private func facts(_ title: TitleSummary) -> some View {
    FlowRow(spacing: Space.s3, lineSpacing: Space.s1_5) {
      let facts = slide.facts(episodes: Str.mediaEpisodeCount)
      if !facts.isEmpty {
        Text(facts.joined(separator: " · ")).textStyle(wide ? .base : .sm)
          .foregroundStyle(palette.foreground.opacity(0.8))
          .lineLimit(1)
      }
      if let rating = title.contentRating {
        Badge(rating, look: .metaOutline)
      }
      if let rating = title.rating {
        HStack(spacing: Space.s1) {
          LucideIcon(.star, label: Str.mediaHeroRated, size: 14, tint: palette.star)
          Text(formatRating(rating)).textStyle(wide ? .base : .sm).foregroundStyle(palette.foreground.opacity(0.8))
        }
        .accessibilityElement(children: .combine)
      }
    }
  }

  /// The picture and its shade hold still where the middle page is and
  /// fade. Pages draw left to right, so the one on the right fades over the
  /// one under it, which stays whole: a crossfade without a seam or a dip to dark.
  private var art: some View {
    let title = slide.title
    let sources =
      HomeDevData.backdrop(slide)
      ?? [
        api?.art(title.images.backdrop, size: .large), api?.art(slide.item.episode?.still, size: .large),
        api?.frame(slide.item.id, large: true),
      ].compactMap(\.self)
    return ZStack(alignment: .bottom) {
      Tone(title.name)
      Picture(sources, alignment: .top)
      if wide {
        // Darken where the text sits and fade into the page below:
        // `from-background/95 via-background/60` across, and up from the bottom.
        LinearGradient(
          stops: [
            .init(color: palette.background.opacity(0.95), location: 0),
            .init(color: palette.background.opacity(0.6), location: 0.5),
            .init(color: palette.background.opacity(0), location: 1),
          ], startPoint: .leading, endPoint: .trailing)
        LinearGradient(
          stops: [
            .init(color: palette.background.opacity(0), location: 0),
            .init(color: palette.background.opacity(0.4), location: 0.65),
            .init(color: palette.background, location: 1),
          ], startPoint: .top, endPoint: .bottom)
      } else {
        // A phone's text spans the width at the bottom, so it gets a shade
        // there and none down the side, which hid half the picture.
        GeometryReader { proxy in
          LinearGradient(
            stops: [
              .init(color: palette.background.opacity(0), location: 0),
              .init(color: palette.background.opacity(0.7), location: 0.45),
              .init(color: palette.background, location: 1),
            ], startPoint: .top, endPoint: .bottom
          )
          .frame(height: proxy.size.height * 0.62)
          .frame(maxHeight: .infinity, alignment: .bottom)
        }
      }
    }
    .visualEffect { content, proxy in
      // How far the page sits from the middle, in pages: 1 one page off to the right.
      let minX = proxy.frame(in: .scrollView(axis: .horizontal)).minX
      let away = minX / max(proxy.size.width, 1)
      return content
        .offset(x: -minX)
        .opacity(away > 0 ? min(max(1 - away, 0), 1) : 1)
    }
  }
}

/// A genre over the art, as the web's: a small frosted capsule, opening the genre's titles.
private struct GenreChip: View {
  let genre: String
  let action: () -> Void
  @Environment(\.palette) private var palette

  init(_ genre: String, action: @escaping () -> Void) {
    self.genre = genre
    self.action = action
  }

  var body: some View {
    Pressable(shape: Capsule(), action: action) {
      Text(genre)
        .textStyle(.xs)
        .lineLimit(1)
        .foregroundStyle(palette.foreground.opacity(0.85))
        .padding(.horizontal, Space.s2_5)
        .padding(.vertical, Space.s0_5)
        .glassBackground(in: Capsule())
        .overlay { Capsule().strokeBorder(palette.foreground.opacity(0.15)) }
        .padding(.vertical, Space.s2)
        .contentShape(Capsule())
    }
  }
}

/// Play and the title's page, for the slide showing. One row that stays in
/// place while the slides swipe under it, and reads the same for every
/// slide so nothing in it changes mid-swipe, as on the web: Play picks up
/// where the person is, which the slide's progress bar shows, and a show's
/// page holds its episodes. On a phone they share the width.
private struct HeroButtons: View {
  let slide: FeaturedTitle
  let wide: Bool
  @Environment(\.navigator) private var nav

  var body: some View {
    HStack(spacing: Space.s2) {
      MatineeButton(Str.mediaHeroPlay, icon: .play, fullWidth: !wide) { nav.play(slide.item.id, nil) }
      MatineeButton(Str.mediaHeroDetails, icon: .info, look: .frosted, fullWidth: !wide) { nav.title(slide.title) }
    }
    .fixedSize(horizontal: wide, vertical: false)
    // A phone's buttons share its width; on its side, not all of it.
    .frame(maxWidth: wide ? nil : 560, alignment: .leading)
  }
}

/// The title as its logo when the provider has one, else as text.
private struct TitleMark: View {
  let slide: FeaturedTitle
  let wide: Bool
  @Environment(\.api) private var api
  @Environment(\.imagePipeline) private var pipeline
  @Environment(\.palette) private var palette
  @State private var failed: URL?

  private var logoURL: URL? {
    guard let api, let logo = slide.title.images.logo else { return nil }
    return URL(string: api.paths.artwork(logo.id, size: .medium))
  }

  var body: some View {
    let logo = HomeDevData.logo(slide) ?? logoURL
    if let logo, failed != logo {
      GeometryReader { proxy in
        LazyImage(request: ImageRequest(url: logo), transaction: Transaction(animation: Motion.image)) { state in
          if let image = state.image {
            image.resizable().aspectRatio(contentMode: .fit)
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
              .shadow(color: .black.opacity(0.5), radius: 6, y: 2)
          }
        }
        .pipeline(pipeline)
        .onCompletion { result in
          if case .failure = result { failed = logo }
        }
        .frame(width: proxy.size.width * 0.8)
      }
      .frame(height: wide ? 120 : 52)
      .accessibilityElement()
      .accessibilityLabel(slide.title.name)
      .accessibilityAddTraits(.isHeader)
    } else {
      // The web's `text-28px` on a phone, whose banner is short; a title
      // that big would reach the header.
      Text(slide.title.name)
        .textStyle(wide ? .xl5 : .px28, weight: .bold, tracking: .tight)
        .foregroundStyle(palette.foreground)
        .lineLimit(2)
        .shadow(color: .black.opacity(0.45), radius: 12)
        .accessibilityAddTraits(.isHeader)
    }
  }
}

/// The banner's place while it loads.
struct HeroSkeleton<Top: View>: View {
  let height: CGFloat
  @ViewBuilder let top: () -> Top
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s4) {
      Skeleton(radius: Radius.md).frame(width: 220, height: 40)
      Skeleton(radius: Radius.md).frame(width: 140, height: 16)
      Skeleton(radius: Radius.lg).frame(height: 44).frame(maxWidth: 560)
    }
    .padding(.horizontal, gutter)
    .padding(.bottom, heroBottom(wide: heroIsWide(width: window.width, height: window.height)))
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    .frame(height: height)
    .background(palette.card)
    .overlay(alignment: .top) { top() }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.loadingInProgress)
  }
}
