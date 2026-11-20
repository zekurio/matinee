import MatineeCore
import MatineeKit
import SwiftUI

/*
 * The web's components/hero.tsx, for an iPad in a regular width: the banner
 * at the top of Home, in the place home.tsx gives it, where the iPhone (and
 * an iPad in a narrow split) has the card carousel (HomeCarousel.swift).
 * How tall it is and where its parts sit for the window, which facts a
 * slide lists, how its repeating pages map to slides, and which parts it
 * shows at all are MatineeCore's `HeroLayout`, `FeaturedTitle.facts`,
 * `HeroPaging`, and `BannerParts` (Home/HomeHero.swift), where they're
 * tested. The name and the genres come from the same helpers as the
 * carousel's cards.
 *
 * Where it differs from the web's: the title is always its name typed out,
 * never the provider's logo, which can't be made to read on every picture
 * (the owner's call); the slides swipe as pages, the art crossfading under
 * them, where the web fades one slide into the next; and the frost under
 * the status bar, which a browser hasn't got, is light at rest over the art.
 */

/// The top of an iPad's Home, in the carousel's place: the banner over the
/// featured titles, or while they load, its place. With none, or when they
/// failed, Home's header alone, which `header` is: the cloud while the
/// server can't be reached, else a little room under the tabs.
struct HomeBanner<Header: View>: View {
  let loaders: HomeLoaders
  /// The title in view, which the phone's cards share (`Hero.showing`).
  let showing: Binding<String?>
  @ViewBuilder let header: () -> Header

  var body: some View {
    let rowsBelow = rowsFollowBanner(resume: loaders.resume.state, nextUp: loaders.nextUp.state)
    switch loaders.featured.state {
    case .loading:
      HeroSkeleton(rowsBelow: rowsBelow, top: header)
    case .failed:
      header()
    case .ready(let slides):
      if slides.isEmpty {
        header()
      } else {
        // Other titles start it at the first again.
        Hero(slides: slides, showing: showing, rowsBelow: rowsBelow, top: header).id(slides.map(\.title.id))
      }
    }
  }
}

/// The banner at the top of an iPad's Home: new and well-rated titles over
/// their art, with Play starting where the person is in each. It moves on
/// every eight seconds, as the web's, always forward: the pages repeat, so
/// after the last comes the first again. It holds while a finger, a
/// pointer, or the keyboard is on it, while a title's actions are open,
/// under VoiceOver, and under Reduce Motion; a slide picked by hand gets a
/// full eight seconds again.
///
/// It reaches up under the tabs and the status bar (`\.navBarClearance`);
/// `top` lies over it there, under the tabs: Home's header, when it has the
/// cloud to show.
struct Hero<Top: View>: View {
  let slides: [FeaturedTitle]
  /// The title in view, by its id, which the phone's cards share: the
  /// banner opens on it and says which slide it came to rest on, so an
  /// iPad's window that crosses between the two keeps the same title in view.
  @Binding var showing: String?
  /// Whether Continue watching or Next up follow it, which on an iPad on its
  /// side keeps it short enough for them to start in the first screen.
  let rowsBelow: Bool
  @ViewBuilder let top: () -> Top

  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter
  @Environment(\.navBarClearance) private var topInset
  @Environment(\.actions) private var actions
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @State private var position: ScrollPosition
  /// The page it last came to rest on, which the advance waits on.
  @State private var settled: Int
  /// The page nearest the middle, which the buttons and dots follow.
  @State private var current: Int
  @State private var dragging = false
  @State private var hovering = false
  @FocusState private var focused: Bool
  /// How tall the buttons are, which a slide's text keeps clear of.
  @State private var buttonsHeight: CGFloat = TouchTarget
  /// How tall the tallest slide's text is, for which large text grows the banner.
  @State private var textHeight: CGFloat = 0
  /// How far Home has scrolled the banner up under the tabs.
  @State private var frost = StatusBarFrostStrength(offset: 0)

  private let parts = BannerParts.ipad

  init(
    slides: [FeaturedTitle], showing: Binding<String?>, rowsBelow: Bool, @ViewBuilder top: @escaping () -> Top
  ) {
    self.slides = slides
    _showing = showing
    self.rowsBelow = rowsBelow
    self.top = top
    let start = featuredIndex(showing: showing.wrappedValue, in: slides.map(\.title.id))
    let first = HeroPaging.page(showing: start, from: HeroPaging.initialPage(slides.count), count: slides.count)
    _position = State(initialValue: ScrollPosition(id: first))
    _settled = State(initialValue: first)
    _current = State(initialValue: first)
  }

  var body: some View {
    let count = slides.count
    let layout = HeroLayout(width: window.width, height: window.height, rowsBelow: rowsBelow)
    let reserved = layout.buttonsBottom + (parts.buttons ? buttonsHeight + layout.textGap : 0)
    // Large text grows it rather than run the title up under the tabs.
    let height = max(layout.height, topInset + Self.headerRoom + textHeight + reserved)
    ScrollView(.horizontal) {
      LazyHStack(alignment: .top, spacing: 0) {
        ForEach(0..<HeroPaging.pages(count), id: \.self) { page in
          let index = HeroPaging.slide(page, count: count)
          HeroSlide(
            slide: slides[index], layout: layout, parts: parts,
            top: topInset + Self.headerRoom, bottom: reserved
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
    .onScrollPhaseChange { _, phase in
      dragging = phase == .interacting
      if phase == .idle { settled = current }
    }
    .onPreferenceChange(HeroTextHeight.self) { textHeight = $0 }
    // Waits on the page it settled on, so the advance's own scroll doesn't cancel it.
    .task(id: HeroAdvance(page: settled, paused: paused), advance)
    .onChange(of: settled) { _, page in showing = slides[HeroPaging.slide(page, count: count)].title.id }
    .overlay(alignment: .bottom) { controls(layout: layout, count: count) }
    .overlay(alignment: .top) { top().padding(.top, topInset) }
    .ignoresSafeArea(edges: .horizontal)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.tvHomeFeatured)
    // VoiceOver swipes up and down to change slides, as a carousel takes.
    .accessibilityAdjustableAction(adjust)
    // A keyboard steps through the slides with the arrows; a pointer holds it.
    .focusable()
    .focused($focused)
    .focusEffectDisabled()
    .onKeyPress(.leftArrow) { step(-1) }
    .onKeyPress(.rightArrow) { step(1) }
    .onHover { hovering = $0 }
    // The frost under the status bar: light while the art is under it, the
    // tabs' own once Home has scrolled 40 points.
    .onGeometryChange(for: StatusBarFrostStrength.self) { proxy in
      StatusBarFrostStrength(offset: -proxy.frame(in: .global).minY)
    } action: { value in
      frost = value
    }
    .navBarFrost(NavBarFrost(veil: frost.veil, reducedVeil: frost.reducedVeil))
    // Up under the tabs and the status bar.
    .padding(.top, -topInset)
  }

  /// Room under the tabs for Home's header, which the text keeps clear of.
  static var headerRoom: CGFloat { 56 }

  /// Play and Details, the dots, and previous and next: on a desktop-sized
  /// window all in one row, the dots at the right level with the buttons; on
  /// a tablet-sized one the dots and arrows in a row of their own under the
  /// buttons, as the web's.
  @ViewBuilder private func controls(layout: HeroLayout, count: Int) -> some View {
    let slide = slides[HeroPaging.slide(current, count: count)]
    ZStack(alignment: .bottom) {
      HStack(alignment: .center, spacing: Space.s3) {
        if parts.buttons {
          HeroButtons(slide: slide)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { buttonsHeight = $0 }
        }
        if layout.dotsBesideButtons {
          Spacer(minLength: 0)
          pager(count: count)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.bottom, layout.buttonsBottom)
      if !layout.dotsBesideButtons {
        HStack(spacing: Space.s3) {
          Spacer(minLength: 0)
          pager(count: count)
        }
        .padding(.bottom, layout.dotsBottom)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, gutter)
  }

  /// The dots and previous and next, with more than one slide.
  @ViewBuilder private func pager(count: Int) -> some View {
    if count > 1 {
      HStack(spacing: Space.s3) {
        HeroDots(count: count, active: HeroPaging.slide(current, count: count), onPick: pick)
        HStack(spacing: Space.s1) {
          RoundIconButton(.chevronLeft, label: Str.iosMediaHeroPrevious, look: .ghost, size: 36, iconSize: 20) {
            _ = step(-1)
          }
          RoundIconButton(.chevronRight, label: Str.iosMediaHeroNext, look: .ghost, size: 36, iconSize: 20) {
            _ = step(1)
          }
        }
        .shadow(color: .black.opacity(0.5), radius: 2, y: 1)
      }
    }
  }

  /// Whether it holds where it is rather than move on by itself.
  private var paused: Bool {
    dragging || hovering || focused || reduceMotion || voiceOver || actions?.target != nil || slides.count < 2
  }

  /// Moves on a slide once it has rested eight seconds, unless it holds.
  private func advance() async {
    guard !paused else { return }
    try? await Task.sleep(for: HeroPaging.advance)
    guard !Task.isCancelled else { return }
    withAnimation(Motion.easing(0.5)) { position.scrollTo(id: settled + 1) }
  }

  private func step(_ by: Int) -> KeyPress.Result {
    guard slides.count > 1 else { return .ignored }
    withMotion(Motion.move) { position.scrollTo(id: current + by) }
    return .handled
  }

  /// A dot's slide, on the nearest page showing it.
  private func pick(_ index: Int) {
    withMotion(Motion.move) {
      position.scrollTo(id: HeroPaging.page(showing: index, from: current, count: slides.count))
    }
  }

  private func adjust(_ direction: AccessibilityAdjustmentDirection) {
    switch direction {
    case .increment: _ = step(1)
    case .decrement: _ = step(-1)
    @unknown default: break
    }
  }
}

private struct HeroAdvance: Equatable {
  let page: Int
  let paused: Bool
}

/// The tallest text among the slides laid out.
private struct HeroTextHeight: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

/// The web's dots: which slide shows, the open one long, each a button to its slide.
private struct HeroDots: View {
  let count: Int
  let active: Int
  let onPick: (Int) -> Void

  var body: some View {
    HStack(spacing: 0) {
      ForEach(0..<count, id: \.self) { index in
        HeroDot(on: index == active, label: Str.iosMediaHeroShowSlide(index + 1)) { onPick(index) }
      }
    }
    .motion(Motion.move, value: active)
  }
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

/// One slide: its text, low on the left, over its art. The art holds still
/// and crossfades with the next one's as the pages move, as the web's
/// slides fade, rather than the pictures sliding edge to edge; the text
/// slides with the page.
private struct HeroSlide: View {
  let slide: FeaturedTitle
  let layout: HeroLayout
  let parts: BannerParts
  /// Room at the top for the tabs and Home's header.
  let top: CGFloat
  /// Room at the bottom for the buttons, which stay while the slides swipe.
  let bottom: CGFloat

  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter

  var body: some View {
    HeroText(slide: slide, layout: layout, parts: parts)
      .fixedSize(horizontal: false, vertical: true)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { textHeight = $0 }
      .preference(key: HeroTextHeight.self, value: textHeight)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
      .padding(.horizontal, gutter)
      .padding(.top, top)
      .padding(.bottom, bottom)
      .background { HeroArt(slide: slide) }
  }

  @State private var textHeight: CGFloat = 0
}

/// A slide's words: the name, the facts, the genres, the overview, and how
/// far the person is, each as the web's.
private struct HeroText: View {
  let slide: FeaturedTitle
  let layout: HeroLayout
  let parts: BannerParts

  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    let title = slide.title
    let item = slide.item
    let ratio = progressRatio(item)
    let left = timeLeft(item)
    VStack(alignment: .leading, spacing: 0) {
      // `text-[clamp(…)]` bold, tight, two lines at most, as the web's name
      // where a title has no logo; 48 on an iPad, the scale's largest.
      Text(slide.featuredName)
        .textStyle(layout.titleSize >= 48 ? .xl5 : .xl4, weight: .bold, tracking: .tight)
        .foregroundStyle(palette.foreground)
        // A third line at the accessibility sizes, for which the banner grows.
        .lineLimit(dynamicType.isAccessibilitySize ? 3 : 2)
        .shadow(color: .black.opacity(0.45), radius: 12, y: 2)
        .frame(maxWidth: 672, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
      if parts.facts {
        HeroFacts(slide: slide).padding(.top, Space.s3_5)
      }
      genres.padding(.top, Space.s3)
      if parts.overview, layout.showsOverview, let overview = title.overview {
        Text(overview)
          .textStyle(.sm)
          .lineSpacing(4)
          .foregroundStyle(palette.foreground.opacity(0.7))
          .lineLimit(3)
          .frame(maxWidth: 576, alignment: .leading)
          .padding(.top, Space.s2)
      }
      if let ratio, let left {
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
        .padding(.top, Space.s4)
      }
    }
  }

  /// The genres, as `BannerParts` says: the web's badges, or the line the
  /// iPhone's card has.
  @ViewBuilder private var genres: some View {
    let genres = slide.shownGenres
    if layout.showsGenres, !genres.isEmpty {
      switch parts.genres {
      case .badges:
        FlowRow(spacing: Space.s1_5, lineSpacing: Space.s1_5) {
          ForEach(genres, id: \.self) { genre in
            GenreBadge(genre) { nav.genre(genre) }
          }
        }
        // The badges' room to hit reaches past the row, which sits as close
        // to the lines around it as the web's.
        .padding(.vertical, -GenreBadge.reach)
      case .line:
        if let line = slide.cardLine(genre: genreName) {
          Text(line).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground.opacity(0.85)).lineLimit(1)
        }
      case .none:
        EmptyView()
      }
    }
  }
}

/// The year and episode count, the age rating, and the score, in a line
/// that wraps: the web's `text-base` at 80%.
private struct HeroFacts: View {
  let slide: FeaturedTitle
  @Environment(\.palette) private var palette

  var body: some View {
    let title = slide.title
    let facts = slide.facts(episodes: Str.mediaEpisodeCount)
    FlowRow(spacing: Space.s3, lineSpacing: Space.s1_5) {
      if !facts.isEmpty {
        Text(facts.joined(separator: " · ")).textStyle(.base)
          .foregroundStyle(palette.foreground.opacity(0.8))
          .lineLimit(1)
      }
      if let rating = title.contentRating {
        Badge(rating, look: .metaOutline)
      }
      if let rating = title.rating {
        HStack(spacing: Space.s1) {
          LucideIcon(.star, label: Str.mediaHeroRated, size: 14, tint: palette.star)
          Text(formatRating(rating)).textStyle(.base).foregroundStyle(palette.foreground.opacity(0.8))
        }
        .accessibilityElement(children: .combine)
      }
    }
    .frame(maxWidth: 576, alignment: .leading)
  }
}

/// A genre over the art, as the web's: a small frosted capsule, opening the genre's titles.
private struct GenreBadge: View {
  let genre: String
  let action: () -> Void
  @Environment(\.palette) private var palette

  init(_ genre: String, action: @escaping () -> Void) {
    self.genre = genre
    self.action = action
  }

  var body: some View {
    Pressable(shape: Capsule(), action: action) {
      Text(genreName(genre))
        .textStyle(.xs)
        .lineLimit(1)
        .foregroundStyle(palette.foreground.opacity(0.85))
        .padding(.horizontal, Space.s2_5)
        .padding(.vertical, Space.s0_5)
        .glassBackground(in: Capsule())
        .overlay { Capsule().strokeBorder(palette.foreground.opacity(0.15)) }
        .padding(.vertical, Self.reach)
        .contentShape(Capsule())
    }
  }

  /// How far above and below the badge a finger still hits it.
  static var reach: CGFloat { Space.s2 }
}

/// Play and the title's page, for the slide showing: one row that stays in
/// place while the slides swipe under it, and reads the same for every
/// slide, as the web's. Play picks up where the person is, which the
/// slide's progress bar shows, and a show's page holds its episodes.
private struct HeroButtons: View {
  let slide: FeaturedTitle
  @Environment(\.navigator) private var nav

  var body: some View {
    HStack(spacing: Space.s2) {
      MatineeButton(Str.titlePlay, icon: .play, action: play)
      MatineeButton(Str.mediaHeroDetails, icon: .info, look: .frosted, action: details)
    }
    .fixedSize()
  }

  private func play() { nav.play(slide.item.id, nil) }
  private func details() { nav.title(slide.title) }
}

/// A slide's picture and its shade. The backdrop, else a show's episode
/// still, else a frame from the file, as the web's; with none, the title's
/// tone. The shade is the web's, in the page's color: across from the text's
/// side, `from-background/85 via-background/45 via-30% to-transparent
/// to-65%`, and up the lower half into the page, `from-background
/// via-background/30 via-35%`.
private struct HeroArt: View {
  let slide: FeaturedTitle
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette

  private var sources: [ImageSource] {
    let title = slide.title
    return [
      api?.art(title.images.backdrop, size: .large), api?.art(slide.item.episode?.still, size: .large),
      api?.frame(slide.item.id, large: true),
    ].compactMap(\.self)
  }

  var body: some View {
    ZStack {
      Tone(slide.title.name)
      Picture(sources, alignment: .top)
      LinearGradient(
        stops: [
          .init(color: palette.background.opacity(0.85), location: 0),
          .init(color: palette.background.opacity(0.45), location: 0.3),
          .init(color: palette.background.opacity(0), location: 0.65),
        ], startPoint: .leading, endPoint: .trailing)
      LinearGradient(
        stops: [
          .init(color: palette.background.opacity(0), location: 0.5),
          .init(color: palette.background.opacity(0.3), location: 0.825),
          .init(color: palette.background, location: 1),
        ], startPoint: .top, endPoint: .bottom)
    }
    .accessibilityHidden(true)
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

/// The banner's place while the featured titles load, as tall as it'll be.
struct HeroSkeleton<Top: View>: View {
  let rowsBelow: Bool
  @ViewBuilder let top: () -> Top
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter
  @Environment(\.navBarClearance) private var topInset

  var body: some View {
    let layout = HeroLayout(width: window.width, height: window.height, rowsBelow: rowsBelow)
    VStack(alignment: .leading, spacing: Space.s4) {
      Skeleton(radius: Radius.md).frame(width: 320, height: 48)
      Skeleton(radius: Radius.md).frame(width: 180, height: 20)
      HStack(spacing: Space.s2) {
        Skeleton(radius: Radius.lg).frame(width: 104, height: TouchTarget)
        Skeleton(radius: Radius.lg).frame(width: 120, height: TouchTarget)
      }
    }
    .padding(.horizontal, gutter)
    .padding(.bottom, layout.buttonsBottom)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    .frame(height: layout.height)
    .background(palette.card)
    .overlay(alignment: .top) { top().padding(.top, topInset) }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.loadingInProgress)
    .padding(.top, -topInset)
  }
}
