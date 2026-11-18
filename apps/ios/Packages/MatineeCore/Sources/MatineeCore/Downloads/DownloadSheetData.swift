import Foundation

/*
 * What DownloadSheet.kt and DownloadFilesSheet.kt decide from the server's
 * answers: which versions show, which audio goes in, when Download may be
 * pressed, what the codec row says, and how big a season comes to. The
 * server decides what each version holds (`downloads.resolve`); this only
 * reads its answers. The sheets draw it; the words are the app's.
 */

/// The choices a file's sheet shows: for this device, each preset the
/// server could plan, and the file as it is. A preset the server can't
/// make for this file doesn't show.
public func shownChoices(_ presets: [DownloadVideoPreset], plans: [DownloadChoice: DownloadPlan])
  -> [DownloadChoice]
{
  downloadChoices(presets).filter { $0.preset == nil || plans[$0] != nil }
}

/// The audio tracks picked, by stream index, as the version holds them:
/// the primary track first, as the file plays it, then the rest in the
/// file's order.
public func chosenAudio(_ source: DownloadSource, indices: [Int]) -> [AudioTrack] {
  let chosen = source.audio.filter { indices.contains($0.index) }
  return chosen.filter(\.primary) + chosen.filter { !$0.primary }
}

/// A version for this device needs an audio track, when the file has any.
/// The file as it is keeps every track.
public func missingAudio(_ source: DownloadSource, choice: DownloadChoice, indices: [Int]) -> Bool {
  choice != .original && !source.audio.isEmpty && chosenAudio(source, indices: indices).isEmpty
}

/// Whether Download may be pressed: always for the file as it is; for a
/// version, once the server has planned it for the audio picked.
public func canStart(
  _ choice: DownloadChoice, planning: Bool, missingAudio: Bool, plans: [DownloadChoice: DownloadPlan]
) -> Bool {
  choice == .original || (!planning && !missingAudio && plans[choice] != nil)
}

/// Where the sheet goes once the plans are in: a preset the server can't
/// make for this file falls back to the version for this device.
public func settledChoice(_ choice: DownloadChoice, plans: [DownloadChoice: DownloadPlan]) -> DownloadChoice {
  choice.preset != nil && plans[choice] == nil ? .device(nil) : choice
}

/// The codec row under the versions. It applies only to video that gets
/// encoded: the file as it is keeps its own, and a version for this device
/// without a preset may keep the video, which then stays in its codec.
public enum CodecRow: Sendable, Hashable {
  case hidden
  /// The server keeps the video as it is, in this codec.
  case kept(String)
  /// The codecs to pick from; a single one shows but can't change.
  case choose([String])
}

public func codecRow(_ choice: DownloadChoice, plan: DownloadPlan?, codecs: [String]) -> CodecRow {
  if choice == .original || codecs.isEmpty { return .hidden }
  if choice.preset == nil, let plan, plan.video.mode != "encode" { return .kept(plan.video.codec) }
  return .choose(codecs)
}

/// The codec a sheet starts on: the one Settings names when the server
/// offers it, else the server's first. Nil for "auto" with none offered.
public func startingCodec(_ wanted: String, codecs: [String]) -> String? {
  codecs.contains(wanted) ? wanted : codecs.first
}

/// How big a show's or a season's files come to as `choice`: the files as
/// they are, or what the server estimates for each version it planned.
public func filesSize(_ choice: DownloadChoice, missing: [MediaItem], results: [DownloadResolution]) -> Int64 {
  if choice == .original { return missing.reduce(0) { $0 + $1.sizeBytes } }
  let wanted = Set(missing.map(\.id))
  return results.compactMap(\.ready).filter { wanted.contains($0.id) }.reduce(0) { $0 + $1.plan.estimatedBytes }
}
