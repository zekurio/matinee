import MatineeCore
import SwiftUI

/*
 * Loading, empty, and failed, as Controls.kt and HomeSections.kt draw them:
 * a page's spinner and its error with a way to try again, the disconnect
 * icon every page shows the same while the server can't be reached, the
 * smaller notice a section shows in its place, a rail's skeleton, and the
 * note for a page with nothing on it.
 */

/// A page's spinner, in the middle of what's visible.
struct LoadingBox: View {
  @Environment(\.palette) private var palette

  var body: some View {
    ProgressView()
      .controlSize(.large)
      .tint(palette.accent)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .accessibilityLabel(Str.loadingInProgress)
  }
}

/// What can't show without the server, while it can't be reached: the
/// disconnect icon and a way to try again, nothing more. Every page and
/// section shows the same, so being offline reads the same everywhere.
struct Disconnected: View {
  var onRetry: (() -> Void)?
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 16) {
      LucideIcon(.cloudOff, label: Str.serverUnreachable, size: 32, tint: palette.muted)
      if let onRetry { RetryButton(action: onRetry) }
    }
  }
}

/// Try again, as every failure offers it.
struct RetryButton: View {
  var height: CGFloat = 44
  let action: () -> Void

  var body: some View {
    MatineeButton(.outline, height: height, action: action) {
      LucideIcon(.refreshCw, size: 16)
      Text(Str.commonRetry)
    }
  }
}

/// For a page still showing what loaded before: the disconnect icon in its
/// bar while `loaders` can't reach the server, tapped to try again.
struct DisconnectedAction: View {
  let loaders: [any Reloadable]
  @Environment(\.palette) private var palette

  init(_ loaders: any Reloadable...) { self.loaders = loaders }

  init(_ loaders: [any Reloadable]) { self.loaders = loaders }

  var body: some View {
    let cut = loaders.filter { $0.refreshError != nil && $0.refreshDisconnected }
    if !cut.isEmpty {
      RoundIconButton(
        .cloudOff, label: Str.serverUnreachable, size: 40, iconSize: 20, tint: palette.muted, background: .clear
      ) { cut.forEach { $0.reload() } }
      .disabled(cut.contains { $0.refreshing })
    }
  }
}

/// What `DisconnectedAction` and notices need of a `Loader`, whatever it loads.
protocol Reloadable: AnyObject {
  var refreshError: String? { get }
  var refreshDisconnected: Bool { get }
  var refreshing: Bool { get }
  func reload()
}

extension Loader: Reloadable {}

/// What failed, with a way to try again; while the server can't be
/// reached, just `Disconnected`.
struct ErrorBox: View {
  let title: String
  var message: String?
  var disconnected = false
  var onRetry: (() -> Void)?
  @Environment(\.palette) private var palette

  init(_ title: String, _ message: String? = nil, disconnected: Bool = false, onRetry: (() -> Void)? = nil) {
    self.title = title
    self.message = message
    self.disconnected = disconnected
    self.onRetry = onRetry
  }

  var body: some View {
    Group {
      if disconnected {
        Disconnected(onRetry: onRetry)
      } else {
        VStack(spacing: 0) {
          LucideIcon(.circleAlert, size: 24, tint: palette.muted)
            .frame(width: 48, height: 48)
            .background(palette.secondary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
          Text(title).textStyle(.titleMedium).multilineTextAlignment(.center).padding(.top, 16)
          if let message {
            Text(message).textStyle(.bodyMedium).foregroundStyle(palette.muted)
              .multilineTextAlignment(.center).padding(.top, 4)
          }
          if let onRetry { RetryButton(action: onRetry).padding(.top, 20) }
        }
        .accessibilityElement(children: .contain)
      }
    }
    .padding(32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// A page or section with nothing to show yet: an icon, what's missing, and
/// what to do about it, as Home's note for no libraries.
struct EmptyState: View {
  let icon: Lucide
  let title: String
  var message: String?
  @Environment(\.palette) private var palette

  init(_ icon: Lucide, _ title: String, _ message: String? = nil) {
    self.icon = icon
    self.title = title
    self.message = message
  }

  var body: some View {
    VStack(spacing: 0) {
      LucideIcon(icon, size: 32, tint: palette.muted)
      Text(title).textStyle(.titleMedium).multilineTextAlignment(.center).padding(.top, 16)
      if let message {
        Text(message).textStyle(.bodyMedium).foregroundStyle(palette.muted)
          .multilineTextAlignment(.center).padding(.top, 4)
      }
    }
    .padding(.horizontal, Gutter)
    .padding(.vertical, 48)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
  }
}

/// Something on the page that didn't load or refresh, with a way to try
/// again. Smaller than an ErrorBox, so it fits in a section's place.
struct Notice: View {
  let headline: String
  var message: String?
  var retrying = false
  var disconnected = false
  var onRetry: (() -> Void)?
  @Environment(\.palette) private var palette

  init(
    _ headline: String, _ message: String? = nil, retrying: Bool = false, disconnected: Bool = false,
    onRetry: (() -> Void)? = nil
  ) {
    self.headline = headline
    self.message = message
    self.retrying = retrying
    self.disconnected = disconnected
    self.onRetry = onRetry
  }

  var body: some View {
    // Without the server, the same icon and button as everywhere else; the words are for other failures.
    if disconnected {
      HStack(spacing: 16) {
        LucideIcon(.cloudOff, label: Str.serverUnreachable, size: 24, tint: palette.muted)
        if let onRetry { RetryButton(height: 36, action: onRetry).disabled(retrying) }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, Gutter)
    } else {
      HStack(spacing: 12) {
        LucideIcon(.circleAlert, size: 20, tint: palette.muted)
        VStack(alignment: .leading, spacing: 0) {
          Text(headline).textStyle(.bodyMedium, weight: .medium)
          if let message, !message.isEmpty {
            Text(message).textStyle(.bodySmall).foregroundStyle(palette.muted)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        // An icon, so the words keep the row's width and stay a line or two.
        if let onRetry {
          RoundIconButton(
            .refreshCw, label: Str.commonRetry, size: 40, iconSize: 18, tint: palette.muted, background: .clear,
            action: onRetry
          )
          .disabled(retrying)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .background(palette.card, in: CardShape)
      .overlay { CardShape.strokeBorder(palette.border) }
      .padding(.horizontal, Gutter)
    }
  }
}

/// A rail's section that failed to load: its heading, so the reader knows which, and a `Notice`.
struct RailFailure: View {
  let title: String
  let headline: String
  let message: String
  var retrying = false
  var disconnected = false
  let onRetry: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionTitle(title).padding(.horizontal, Gutter)
      Notice(headline, message, retrying: retrying, disconnected: disconnected, onRetry: onRetry)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Where a rail of `art` cards goes while it loads: its heading, or a bar
/// for one not known yet, over blank cards about as tall as the real ones.
struct RailSkeleton: View {
  let title: String?
  let art: RailArt
  var onTitleTap: (() -> Void)?
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window

  var body: some View {
    let width = art.width(in: window)
    let small = RoundedRectangle(cornerRadius: 4, style: .continuous)
    VStack(alignment: .leading, spacing: 12) {
      Group {
        if let title {
          SectionTitle(title, action: onTitleTap)
        } else {
          small.fill(palette.secondary).frame(width: 180, height: 24)
        }
      }
      .padding(.horizontal, Gutter)
      // A row that doesn't scroll, as Android's, running past the edge as a rail does.
      ScrollView(.horizontal) {
        HStack(alignment: .top, spacing: 12) {
          ForEach(0..<4, id: \.self) { _ in
            VStack(alignment: .leading, spacing: 0) {
              CardShape.fill(palette.card).aspectRatio(art.aspect, contentMode: .fit)
              small.fill(palette.secondary).frame(width: width * 0.7, height: 14).padding(.top, 10)
              small.fill(palette.secondary).frame(width: width * 0.45, height: 12).padding(.top, 6)
            }
            .frame(width: width)
          }
        }
      }
      .contentMargins(.horizontal, Gutter, for: .scrollContent)
      .scrollDisabled(true)
      .scrollIndicators(.hidden)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement()
    .accessibilityLabel(Str.loadingInProgress)
  }
}
