import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Loading, empty, and failed, as Controls.kt and Errors.kt draw them.
 *
 * A failure always looks the same: a plain icon, a heading that starts
 * "Couldn't", the reason in a line or two at most, and Try again. A page
 * with nothing else to show also offers Back to Home, so there's a way on
 * when trying again won't help. Only where it sits changes:
 *
 * - `ErrorBox`: centered in a page with nothing else to show.
 * - `ErrorSection`: in a section's place, or at the end of a list whose
 *   next page didn't load, among what did.
 * - `RailFailed`: a rail's heading over an `ErrorSection`.
 *
 * While the server can't be reached, each is just `Disconnected`: the cloud
 * and the buttons, no words, so being offline reads the same everywhere.
 * A page still showing what loaded before puts `DisconnectedAction` in its
 * bar instead.
 */

/// A page's spinner, in the middle of what's visible: above the tabs on a
/// tab's first page, as the tabs take their room from the safe area.
struct LoadingBox: View {
  @Environment(\.palette) private var palette

  var body: some View {
    Spinner(size: 32, tint: palette.accent)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

extension EnvironmentValues {
  /// Back to Home for an `ErrorBox`, where the page has nowhere else to go:
  /// the shell sets it on pages opened from a tab, and leaves it out on a
  /// tab's first page, whose tabs lead there already, offline, where Home is
  /// the downloads, and in the player.
  @Entry var homeAction: (() -> Void)? = nil
}

/// What failed, centered in the page, with Try again and, on a page opened
/// from a tab, Back to Home; while the server can't be reached, just
/// `Disconnected`.
struct ErrorBox: View {
  let title: String
  var message: String?
  var disconnected = false
  var icon: Lucide = .circleAlert
  var onRetry: (() -> Void)?
  @Environment(\.homeAction) private var homeAction

  init(
    _ title: String, _ message: String? = nil, disconnected: Bool = false, icon: Lucide = .circleAlert,
    onRetry: (() -> Void)? = nil
  ) {
    self.title = title
    self.message = message
    self.disconnected = disconnected
    self.icon = icon
    self.onRetry = onRetry
  }

  var body: some View {
    ErrorState(
      title, message, icon: icon, disconnected: disconnected, onRetry: onRetry, onHome: homeAction
    )
    .padding(.vertical, Space.s8)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// `ErrorBox`'s content, for where it's one part of a page or the body of a
/// sheet rather than the whole page. `icon` is for a failure with its own.
struct ErrorState: View {
  let title: String
  var message: String?
  var icon: Lucide = .circleAlert
  var disconnected = false
  var retrying = false
  var onRetry: (() -> Void)?
  var onHome: (() -> Void)?
  @Environment(\.palette) private var palette

  init(
    _ title: String, _ message: String? = nil, icon: Lucide = .circleAlert, disconnected: Bool = false,
    retrying: Bool = false, onRetry: (() -> Void)? = nil, onHome: (() -> Void)? = nil
  ) {
    self.title = title
    self.message = message
    self.icon = icon
    self.disconnected = disconnected
    self.retrying = retrying
    self.onRetry = onRetry
    self.onHome = onHome
  }

  var body: some View {
    if disconnected {
      Disconnected(retrying: retrying, onRetry: onRetry, onHome: onHome)
    } else {
      VStack(spacing: 0) {
        LucideIcon(icon, size: 32, tint: palette.mutedForeground)
        Text(title)
          .textStyle(.base, weight: .semibold)
          .foregroundStyle(palette.foreground)
          .padding(.top, Space.s4)
          .accessibilityAddTraits(.isHeader)
        if let message, !message.isEmpty, message != title {
          Text(message)
            .textStyle(.sm)
            .foregroundStyle(palette.mutedForeground)
            .lineLimit(2)
            .padding(.top, Space.s1)
        }
        ErrorActions(retrying: retrying, onRetry: onRetry, onHome: onHome)
      }
      .multilineTextAlignment(.center)
      .frame(maxWidth: 360)
      .padding(.horizontal, Space.s8)
      .accessibilityElement(children: .contain)
    }
  }
}

/// What can't show without the server, while it can't be reached: the
/// cloud and a way to try again, nothing more. Every page and section shows
/// the same, so being offline reads the same everywhere.
struct Disconnected: View {
  var retrying = false
  var onRetry: (() -> Void)?
  var onHome: (() -> Void)?
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      LucideIcon(.cloudOff, label: Str.serverUnreachable, size: 32, tint: palette.mutedForeground)
      ErrorActions(retrying: retrying, onRetry: onRetry, onHome: onHome)
    }
    .accessibilityElement(children: .contain)
  }
}

/// Try again, and Back to Home beside it where there's one, in words only.
private struct ErrorActions: View {
  let retrying: Bool
  let onRetry: (() -> Void)?
  let onHome: (() -> Void)?

  var body: some View {
    if onRetry != nil || onHome != nil {
      // Side by side, or one over the other where they don't fit.
      ViewThatFits(in: .horizontal) {
        HStack(spacing: Space.s2) { buttons }
        VStack(spacing: Space.s2) { buttons }
      }
      .padding(.top, Space.s5)
    }
  }

  @ViewBuilder private var buttons: some View {
    if let onRetry {
      MatineeButton(Str.commonRetry, look: .outline, pending: retrying, action: onRetry)
    }
    if let onHome {
      MatineeButton(Str.commonBackHome, look: .ghost, action: onHome)
    }
  }
}

/// `ErrorState` in a section's place on a page that otherwise loaded, or at
/// the end of a list whose next page didn't: across the width, with room
/// above and below.
struct ErrorSection: View {
  let title: String
  var message: String?
  var icon: Lucide = .circleAlert
  var retrying = false
  var disconnected = false
  var onRetry: (() -> Void)?

  init(
    _ title: String, _ message: String? = nil, icon: Lucide = .circleAlert, retrying: Bool = false,
    disconnected: Bool = false, onRetry: (() -> Void)? = nil
  ) {
    self.title = title
    self.message = message
    self.icon = icon
    self.retrying = retrying
    self.disconnected = disconnected
    self.onRetry = onRetry
  }

  var body: some View {
    ErrorState(title, message, icon: icon, disconnected: disconnected, retrying: retrying, onRetry: onRetry)
      .frame(maxWidth: .infinity)
      .padding(.vertical, Space.s6)
  }
}

/// A rail that didn't load: its heading, so the reader knows which, over an `ErrorSection`.
struct RailFailed: View {
  let title: String
  var retrying = false
  var disconnected = false
  let onRetry: () -> Void
  @Environment(\.gutter) private var gutter

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      SectionTitle(title).padding(.horizontal, gutter)
      ErrorSection(Str.railFailed, retrying: retrying, disconnected: disconnected, onRetry: onRetry)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// For a page still showing what loaded before: the cloud in its bar while
/// `loaders` can't reach the server, tapped to try again.
struct DisconnectedAction: View {
  let loaders: [any Reloadable]
  @Environment(\.palette) private var palette

  init(_ loaders: any Reloadable...) { self.loaders = loaders }

  init(_ loaders: [any Reloadable]) { self.loaders = loaders }

  var body: some View {
    let cut = loaders.filter { $0.refreshError != nil && $0.refreshDisconnected }
    if !cut.isEmpty {
      RoundIconButton(
        .cloudOff, label: Str.serverUnreachable, look: .ghost, size: 40, iconSize: 20, tint: palette.mutedForeground
      ) { cut.forEach { $0.reload() } }
      .disabled(cut.contains { $0.refreshing })
    }
  }
}

/// Where a rail of `art` cards goes while it loads: its heading, or a bar
/// for one not known yet, over blank cards about as tall as the real ones.
struct RailSkeleton: View {
  let title: String?
  let art: RailArt
  var onTitleTap: (() -> Void)?
  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter

  var body: some View {
    let width = art.width(in: window)
    VStack(alignment: .leading, spacing: Space.s3) {
      Group {
        if let title {
          SectionTitle(title, action: onTitleTap)
        } else {
          Skeleton(radius: Radius.md).frame(width: 180, height: 24)
        }
      }
      .padding(.horizontal, gutter)
      // A row that doesn't scroll, as Android's, running past the edge as a rail does.
      ScrollView(.horizontal) {
        HStack(alignment: .top, spacing: isWide(window) ? Space.s4 : Space.s3) {
          ForEach(0..<4, id: \.self) { _ in
            VStack(alignment: .leading, spacing: 0) {
              Skeleton(radius: Radius.md).aspectRatio(art.aspect, contentMode: .fit)
              Skeleton(radius: Radius.sm).frame(width: width * 0.7, height: 14).padding(.top, Space.s2_5)
              Skeleton(radius: Radius.sm).frame(width: width * 0.45, height: 12).padding(.top, Space.s1_5)
            }
            .frame(width: width)
          }
        }
      }
      .contentMargins(.horizontal, gutter, for: .scrollContent)
      .scrollDisabled(true)
      .scrollIndicators(.hidden)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement()
    .accessibilityLabel(Str.loadingInProgress)
  }
}
