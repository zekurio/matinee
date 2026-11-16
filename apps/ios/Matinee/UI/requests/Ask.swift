import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Ask.kt, after the web's poster-request.tsx: a title's state and the one
 * thing its viewer may do about it. The state as a glass pill in the
 * corner of a large poster, a catalog page's or a season's; the action as
 * a button leading the page's row, where a library title has Play. A
 * Request that can't be pressed stays, dimmed, and a tap says why at the
 * bottom of the screen, as the web's tooltip does on hover, with the
 * admin's answer when it was declined.
 */

/// The state as a glass pill: the card mark's glyph with its word, and the
/// share that's in while it's on its way. Nothing for a title nobody asked
/// for. With `tip`, for an admin, a tap says who asked, and VoiceOver reads it.
struct PosterBadge: View {
  let availability: Availability
  var tip: String?
  var large = false
  @Environment(\.palette) private var palette
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    if let word = availability.stateWord(today: todayDay()), let badge = availability.badge {
      let percent = availability.state == "coming" ? availability.progress.map(formatPercent) : nil
      // On a phone's narrow poster the share gives way first; the ring still shows it.
      let pill = ViewThatFits(in: .horizontal) {
        content(badge, word: word, percent: percent)
        if percent != nil { content(badge, word: word, percent: nil) }
        // At the largest text sizes, the glyph alone; VoiceOver still reads the word.
        glyph(badge)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel([requestStateText(word), percent].compactMap(\.self).joined(separator: " "))
      .textStyle(large ? .px13 : .xs, weight: .medium)
      .foregroundStyle(palette.foreground)
      .padding(.horizontal, large ? Space.s3 : Space.s2_5)
      .frame(minHeight: large ? Space.s8 : Space.s7)
      .glassBackground(in: Capsule())
      .overlay { Capsule().strokeBorder(palette.foreground.opacity(0.1)) }
      .kitShadow(.small)
      .id(availability.state)
      .transition(Motion.fade)
      if let tip {
        Pressable(shape: Capsule(), action: { snackbar.show(tip) }) { pill }
          .accessibilityValue(tip)
      } else {
        pill
      }
    }
  }

  private func content(_ badge: RequestBadge, word: RequestStateWord, percent: String?) -> some View {
    HStack(spacing: large ? Space.s2 : Space.s1_5) {
      glyph(badge)
      Text(requestStateText(word)).lineLimit(1).fixedSize()
      if let percent { Text(percent).fontWeight(.regular).opacity(0.75).monospacedDigit().fixedSize() }
    }
  }

  @ViewBuilder private func glyph(_ badge: RequestBadge) -> some View {
    let size: CGFloat = large ? 16 : 14
    switch badge.glyph {
    case .clock: LucideIcon(.clock, size: size)
    case .calendar: LucideIcon(.calendar, size: size)
    case .slash: LucideIcon(.circleSlash, size: size, tint: palette.mutedForeground)
    case .ring: ProgressRing(badge.progress, size: large ? 20 : 18).padding(.horizontal, -2)
    }
  }
}

/// Where a request button is drawn: leading a catalog page's row, as large
/// as Play; or `plain`, off a picture, as in a season's dashed frame.
enum RequestButtonLook {
  case page, plain
}

/// The title's one button: "Request" or "Cancel request", whichever the
/// server's action allows, else nothing. Cancelling happens here; a
/// request goes to `onRequest`, which asks at once or opens the request
/// sheet. A Request the viewer
/// can't make, out of requests, with requests off, or declined, stays
/// dimmed, and a tap says why. `action` and `label` stand in for the
/// server's, as "Request more" for a show asked for already.
struct PosterActionButton: View {
  let availability: Availability
  let name: String
  var look: RequestButtonLook = .page
  var busy = false
  var action: RequestPosterAction?
  var label: String?
  var fullWidth = false
  let onRequest: () -> Void
  @Environment(\.requests) private var hub
  @Environment(\.user) private var user
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    let blocked = action == nil && availability.requestBlocked != nil
    if let act = action ?? availability.posterAction ?? (blocked ? .request : nil) {
      let why = blocked ? requestDimmedText(availability, admin: user?.isAdmin == true) : nil
      MatineeButton(
        look: buttonLook(act), size: look == .page ? .touch : .md, dimmed: blocked, pending: busy, fullWidth: fullWidth
      ) {
        press(act, blocked: blocked, why: why)
      } label: {
        if !busy {
          LucideIcon(icon(act), size: look == .page ? 16 : 14)
        }
        Text(act == .request ? label ?? requestPosterActionText(act) : requestPosterActionText(act))
          .lineLimit(look == .page ? 1 : 2)
          .multilineTextAlignment(.center)
      }
      .accessibilityHint(why.map { [$0.text, $0.note].compactMap(\.self).joined(separator: " ") } ?? "")
      .motion(Motion.color, value: act)
    }
  }

  private func buttonLook(_ act: RequestPosterAction) -> ButtonLook {
    if act == .request { return .primary }
    return look == .page ? .frosted : .secondary
  }

  private func icon(_ act: RequestPosterAction) -> Lucide {
    switch act {
    case .request: .plus
    case .cancel: .x
    }
  }

  private func press(_ act: RequestPosterAction, blocked: Bool, why: (text: String, note: String?)?) {
    if blocked {
      if let why { snackbar.post(ToastMessage(why.text, description: why.note)) }
      return
    }
    let id = availability.requestId
    switch act {
    case .request: onRequest()
    case .cancel: if let id { hub?.cancel(id: id, name: name) }
    }
  }
}
