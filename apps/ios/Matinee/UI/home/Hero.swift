import MatineeCore
import Nuke
import NukeUI
import SwiftUI

/*
 * Hero.kt: the banner at the top of Home. Its paging, how far each slide
 * is, and which facts it lists are MatineeCore's `HeroPaging` and
 * `FeaturedTitle` helpers (Home/), where they're tested.
 */

/// The banner at the top of Home: new and well-rated titles over their art,
/// with Play starting where the person is in each. Advances on its own until
/// the person swipes it, always forward: the pages repeat, so after the last
/// comes the first again rather than a rewind through them all. `top` is
/// Home's header, which lies over it; `topInset` is the status bar's height,
/// which the art reaches under.
struct Hero<Top: View>: View {
  let slides: [FeaturedTitle]
  let height: CGFloat
  let topInset: CGFloat
  @ViewBuilder let top: () -> Top

  @Environment(\.windowSize) private var window
  @Environment(\.palette) private var palette
  @State private var position: ScrollPosition
  /// The page it last came to rest on, which the advance waits on.
  @State private var settled: Int
  /// The page nearest the middle, which the buttons and dots follow.
  @State private var current: Int
  /// A swipe holds the banner on what the person picked.
  @State private var held = false
  /// How tall the buttons are, which a slide's text leaves free.
  @State private var buttonsHeight: CGFloat = 44

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
    let wide = isWide(window)
    let bottom = heroBottom(wide: wide)
    ScrollView(.horizontal) {
      LazyHStack(alignment: .top, spacing: 0) {
        ForEach(0..<HeroPaging.pages(count), id: \.self) { page in
          Slide(
            slide: slides[HeroPaging.slide(page, count: count)], wide: wide, topInset: topInset,
            reserved: bottom + buttonsHeight + 14
          )
          .frame(minHeight: height)
          .containerRelativeFrame(.horizontal)
          // The pages beside it are laid out for the swipe, but not there to read.
          .accessibilityHidden(page != current)
        }
      }
      .scrollTargetLayout()
    }
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
    .task(id: AdvanceKey(page: settled, held: held)) {
      guard loops, !held else { return }
      try? await Task.sleep(for: HeroPaging.advance)
      guard !Task.isCancelled else { return }
      withMotion(.timingCurve(0.2, 0, 0, 1, duration: 0.5)) { position.scrollTo(id: settled + 1) }
    }
    .overlay(alignment: .bottomLeading) {
      HeroButtons(slide: slides[HeroPaging.slide(current, count: count)], wide: wide)
        .padding(.horizontal, Gutter)
        .padding(.bottom, bottom)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { buttonsHeight = $0 - bottom }
    }
    .overlay(alignment: .top) { HeroHeader(topInset: topInset, top: top) }
    .overlay(alignment: .bottom) {
      // A phone's banner is kept short so two rows fit under it, and has
      // no room for dots; it's swiped, and advances on its own.
      if loops && wide { dots(count: count) }
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

  private func dots(count: Int) -> some View {
    let active = HeroPaging.slide(current, count: count)
    return HStack(spacing: 6) {
      ForEach(0..<count, id: \.self) { index in
        let on = index == active
        Button {
          held = true
          // The nearest page showing that slide.
          withMotion(Motion.move) {
            position.scrollTo(id: HeroPaging.page(showing: index, from: current, count: count))
          }
        } label: {
          Capsule()
            .fill(on ? palette.foreground : palette.foreground.opacity(0.4))
            .frame(width: on ? 20 : 6, height: 6)
            .padding(.vertical, 8)
            .contentShape(Rectangle().inset(by: -4))
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel(Str.mediaHeroShowSlide(index + 1))
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
    .motion(Motion.move, value: active)
    .padding(.bottom, 6)
  }
}

private struct AdvanceKey: Equatable {
  let page: Int
  let held: Bool
}

/// Space under the banner's buttons: room for the dots on a wide screen, little on a phone.
private func heroBottom(wide: Bool) -> CGFloat { wide ? 32 : 12 }

/// One slide. Its art holds still and crossfades with the next one's as the
/// pages move, as the web's banner does, rather than the pictures sliding
/// edge to edge; its text slides with the page.
private struct Slide: View {
  let slide: FeaturedTitle
  let wide: Bool
  let topInset: CGFloat
  /// Room left at the bottom for the buttons, which stay while the slides swipe.
  let reserved: CGFloat

  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    let title = slide.title
    let item = slide.item
    let ratio = progressRatio(item)
    let left = timeLeft(item)
    let resuming = left != nil && ratio != nil
    VStack(alignment: .leading, spacing: 0) {
      TitleMark(slide: slide, wide: wide).frame(maxWidth: 512, alignment: .leading)
      Gap(10)
      FlowRow(spacing: 12, lineSpacing: 6) {
        let facts = slide.facts(episodes: Str.mediaEpisodeCount)
        if !facts.isEmpty {
          Text(facts.joined(separator: " · ")).textStyle(.bodyLarge).foregroundStyle(palette.foreground.opacity(0.8))
        }
        if let rating = title.contentRating {
          Text(rating)
            .textStyle(.labelMedium)
            .foregroundStyle(palette.foreground.opacity(0.8))
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .overlay {
              RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(palette.foreground.opacity(0.3))
            }
        }
        if let rating = title.rating {
          HStack(spacing: 4) {
            LucideIcon(.star, label: Str.mediaHeroRated, size: 14, tint: palette.star)
            Text(formatRating(rating)).textStyle(.bodyLarge).foregroundStyle(palette.foreground.opacity(0.8))
          }
          .accessibilityElement(children: .combine)
        }
      }
      if slide.showsGenres(wide: wide, resuming: resuming) {
        Gap(8)
        FlowRow(spacing: 6, lineSpacing: 6) {
          ForEach(slide.shownGenres, id: \.self) { genre in
            Button { nav.genre(genre) } label: {
              Text(genre)
                .textStyle(.labelMedium, weight: .regular)
                .lineLimit(1)
                .foregroundStyle(palette.foreground.opacity(0.85))
                .padding(.horizontal, 10)
                .padding(.vertical, 2)
                .background(palette.background.opacity(0.3), in: Capsule())
                .overlay { Capsule().strokeBorder(palette.foreground.opacity(0.15)) }
                .contentShape(Capsule())
            }
            .buttonStyle(RoundPress())
            .hoverEffect(.highlight)
          }
        }
      }
      if wide, let overview = title.overview {
        Gap(8)
        Text(overview)
          .textStyle(.bodyMedium)
          .lineSpacing(4)
          .foregroundStyle(palette.foreground.opacity(0.7))
          .lineLimit(3)
          .frame(maxWidth: 576, alignment: .leading)
      }
      if resuming, let ratio, let left {
        Gap(12)
        HStack(spacing: 12) {
          Capsule()
            .fill(palette.foreground.opacity(0.25))
            .overlay(alignment: .leading) {
              GeometryReader { proxy in
                Capsule().fill(palette.foreground).frame(width: proxy.size.width * min(max(ratio, 0), 1))
              }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
          Text(episodeCode(item).map { "\($0) · \(left)" } ?? left)
            .textStyle(.labelMedium, weight: .regular)
            .foregroundStyle(palette.foreground.opacity(0.8))
            .lineLimit(1)
            .fixedSize()
        }
        .frame(maxWidth: 320)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    .padding(.horizontal, Gutter)
    // Clear of the header at the top, which is the status bar's and 56 more.
    .padding(.top, topInset + 56)
    .padding(.bottom, reserved)
    .background { art }
  }

  /// The picture and its shade hold still where the middle page is and
  /// fade. Pages draw left to right, so the one on the right fades over the
  /// one under it, which stays whole: a crossfade without a seam or a dip to dark.
  private var art: some View {
    let title = slide.title
    let sources =
      HeroDevArt.backdrop(slide)
      ?? [
        api?.art(title.images.backdrop, size: .large), api?.art(slide.item.episode?.still, size: .large),
        api?.frame(slide.item.id, large: true),
      ].compactMap(\.self)
    return ZStack(alignment: .bottom) {
      Tone(title.name)
      Picture(sources, alignment: .top)
      if wide {
        // Darken where the text sits and fade into the page below.
        LinearGradient(
          stops: [
            .init(color: palette.background.opacity(0.95), location: 0),
            .init(color: palette.background.opacity(0.6), location: 0.5),
            .init(color: .clear, location: 1),
          ], startPoint: .leading, endPoint: .trailing)
        LinearGradient(
          stops: [
            .init(color: palette.background.opacity(0.55), location: 0),
            .init(color: .clear, location: 0.25),
            .init(color: palette.background.opacity(0.4), location: 0.55),
            .init(color: palette.background, location: 1),
          ], startPoint: .top, endPoint: .bottom)
      } else {
        // A phone's text spans the width at the bottom, so it gets a
        // shadow there, and none down the side, which hid half the
        // picture. The header has its own shadow at the top.
        GeometryReader { proxy in
          LinearGradient(
            stops: [
              .init(color: .clear, location: 0),
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

/// Play and the title's page, for the slide showing. One row that stays in
/// place while the slides swipe under it, and reads the same for every
/// slide so nothing in it changes mid-swipe, as on the web: Play picks up
/// where the person is, which the slide's progress bar shows, and a show's
/// page holds its episodes.
private struct HeroButtons: View {
  let slide: FeaturedTitle
  let wide: Bool
  @Environment(\.navigator) private var nav

  var body: some View {
    HStack(spacing: 8) {
      MatineeButton(action: { nav.play(slide.item.id, nil) }) {
        HStack(spacing: 8) {
          LucideIcon(.play, size: 16)
          Text(Str.mediaHeroPlay)
        }
        .frame(maxWidth: wide ? nil : .infinity)
      }
      MatineeButton(.frosted, action: { nav.title(slide.title) }) {
        HStack(spacing: 8) {
          LucideIcon(.info, size: 16)
          Text(Str.mediaHeroDetails)
        }
        .frame(maxWidth: wide ? nil : .infinity)
      }
    }
    .fixedSize(horizontal: wide, vertical: false)
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
    let logo = HeroDevArt.logo(slide) ?? logoURL
    if let logo, failed != logo {
      GeometryReader { proxy in
        LazyImage(request: ImageRequest(url: logo), transaction: Transaction(animation: Motion.image)) { state in
          if let image = state.image {
            image.resizable().aspectRatio(contentMode: .fit)
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
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
      // A phone's banner is short; a title that big would reach the header.
      Text(slide.title.name)
        .textStyle(wide ? .displaySmall : .headlineMedium)
        .foregroundStyle(palette.foreground)
        .lineLimit(2)
        .shadow(color: .black.opacity(0.45), radius: 8)
        .accessibilityAddTraits(.isHeader)
    }
  }
}

/// Home's header over the banner, under the status bar. The header's shade
/// starts below the bar, so behind the bar it's as dense as the shade's top:
/// readable over bright art, without a seam where the two meet.
private struct HeroHeader<Top: View>: View {
  let topInset: CGFloat
  @ViewBuilder let top: () -> Top
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      palette.background.opacity(0.85).frame(height: topInset)
      top()
    }
  }
}

/// The banner's place while it loads.
struct HeroSkeleton<Top: View>: View {
  let height: CGFloat
  let topInset: CGFloat
  @ViewBuilder let top: () -> Top
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window

  var body: some View {
    let small = RoundedRectangle(cornerRadius: 4, style: .continuous)
    VStack(alignment: .leading, spacing: 16) {
      small.fill(palette.secondary).frame(width: 220, height: 48)
      small.fill(palette.secondary).frame(width: 140, height: 16)
    }
    .padding(Gutter)
    .padding(.bottom, heroBottom(wide: isWide(window)))
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    .frame(height: height)
    .background(palette.card)
    .overlay(alignment: .top) { HeroHeader(topInset: topInset, top: top) }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.loadingInProgress)
  }
}

/// Views side by side, wrapping onto more lines when they don't fit, each
/// line's views centered on each other: Compose's `FlowRow`.
private struct FlowRow: Layout {
  var spacing: CGFloat
  var lineSpacing: CGFloat

  init(spacing: CGFloat, lineSpacing: CGFloat) {
    self.spacing = spacing
    self.lineSpacing = lineSpacing
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let lines = arrange(subviews, width: proposal.width ?? .infinity)
    let width = lines.map(\.width).max() ?? 0
    let height = lines.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(lines.count - 1, 0))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for line in arrange(subviews, width: bounds.width) {
      var x = bounds.minX
      for (index, size) in line.items {
        subviews[index].place(
          at: CGPoint(x: x, y: y + (line.height - size.height) / 2), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += line.height + lineSpacing
    }
  }

  private struct Line {
    var items: [(Int, CGSize)] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Line] {
    var lines: [Line] = []
    var line = Line()
    for (index, subview) in subviews.enumerated() {
      var size = subview.sizeThatFits(.unspecified)
      // Wider than a line, as a long text at a large size: it wraps instead.
      if size.width > width { size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
      if !line.items.isEmpty, line.width + spacing + size.width > width {
        lines.append(line)
        line = Line()
      }
      line.width += (line.items.isEmpty ? 0 : spacing) + size.width
      line.height = max(line.height, size.height)
      line.items.append((index, size))
    }
    if !line.items.isEmpty { lines.append(line) }
    return lines
  }
}
