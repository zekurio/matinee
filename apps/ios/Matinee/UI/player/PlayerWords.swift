import MatineeCore

/// The heading over `refusalMessage` when the server won't play the file for this account.
func refusalTitle(_ refusal: Refusal) -> String {
  switch refusal {
  case .restricted: Str.playerRestricted
  case .busy: Str.playerBusy
  }
}

/// What the player says under `refusalTitle`: why, in the app's language for a
/// reason it knows, else in the server's words, as Android's `refusalMessage`.
func refusalMessage(_ reason: RefusalReason?, fallback: String) -> String {
  switch reason {
  case .restricted(PlaybackRestriction.bitrate_original): Str.playerRestrictedOriginal
  case .restricted(PlaybackRestriction.bitrate_transcode): Str.playerRestrictedNoTranscode
  case .restricted(PlaybackRestriction.bitrate_failed): Str.playerRestrictedFailed
  case .restricted(PlaybackRestriction.bitrate): Str.playerRestrictedBitrate
  case .restricted(PlaybackRestriction.transcode): Str.playerRestrictedTranscode
  case .busy(let playing): Str.playerBusyDetail(playing)
  case .restricted, nil: fallback
  }
}

/// What the button that skips `kind` says, like "Skip intro".
func skipSegmentLabel(_ kind: String) -> String {
  switch kind {
  case MediaSegmentKind.recap: Str.playerSkipRecap
  case MediaSegmentKind.credits: Str.playerSkipCredits
  case MediaSegmentKind.preview: Str.playerSkipPreview
  default: Str.playerSkipIntro
  }
}

func noticeTitle(_ note: MatineeCore.Notice) -> String {
  switch note.kind {
  case .burnInFailed: Str.playerNoticeBurnInFailed
  case .qualityFailed, .switchFailed: Str.playerNoticeSwitchFailed
  }
}

func noticeDetail(_ note: MatineeCore.Notice) -> String? {
  let detail: String? =
    switch note.kind {
    case .burnInFailed: Str.playerNoticeBurnInFailedDetail
    case .qualityFailed: Str.playerNoticeQualityFailedDetail
    case .switchFailed: note.detail.map { refusalMessage(note.refusal, fallback: $0) }
    }
  return detail?.isEmpty == false ? detail : nil
}

/// How long a note about the last answer stays.
let NOTICE_SECONDS = 5

/// Tells one notice from the next, which `Notice` itself can't, having no identity.
struct NoticeKey: Equatable {
  let kind: NoticeKind
  let detail: String?
  init(_ notice: MatineeCore.Notice) {
    kind = notice.kind
    detail = notice.detail
  }
}
