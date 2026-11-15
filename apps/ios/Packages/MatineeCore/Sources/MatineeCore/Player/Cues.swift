import Foundation

public struct CueSpan: Sendable, Equatable {
  public var text: String
  public var bold: Bool
  public var italic: Bool
  public var underline: Bool
}
public struct Cue: Sendable, Equatable {
  public var start: Double
  public var end: Double
  public var spans: [CueSpan]
  public var text: String { spans.map(\.text).joined() }
}
public struct CueTrack: Sendable {
  public let cues: [Cue]
  public init(cues: [Cue]) { self.cues = cues.sorted { $0.start < $1.start } }
  public func at(_ seconds: Double) -> [Cue] {
    var low = 0
    var high = cues.count
    while low < high {
      let mid = (low + high) / 2
      if cues[mid].start <= seconds { low = mid + 1 } else { high = mid }
    }
    return cues[max(0, low - 16)..<low].filter { $0.end > seconds }
  }
  public static func parse(_ source: String) -> CueTrack {
    let timing = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/
    func seconds(_ stamp: Substring) -> Double {
      stamp.replacingOccurrences(of: ",", with: ".").split(separator: ":").reduce(0) {
        $0 * 60 + (Double($1) ?? 0)
      }
    }
    let normalized = source.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(
      of: "\r", with: "\n")
    var cues: [Cue] = []
    for block in normalized.split(separator: /\n{2,}/) {
      let lines = block.split(separator: "\n", omittingEmptySubsequences: false)
      let header = lines.first?.trimmingCharacters(in: .whitespaces) ?? ""
      // Metadata blocks may contain arrows, but never contain cues.
      if header == "NOTE" || header.hasPrefix("NOTE ") || header.hasPrefix("NOTE\t")
        || header == "STYLE" || header == "REGION"
      {
        continue
      }
      guard let index = lines.firstIndex(where: { $0.firstMatch(of: timing) != nil }),
        let match = lines[index].firstMatch(of: timing)
      else { continue }
      let text = lines.dropFirst(index + 1).filter {
        !$0.trimmingCharacters(in: .whitespaces).isEmpty
      }.joined(separator: "\n")
      if !text.isEmpty {
        cues.append(Cue(start: seconds(match.1), end: seconds(match.2), spans: styled(text)))
      }
    }
    return CueTrack(cues: cues)
  }
  private static func styled(_ text: String) -> [CueSpan] {
    var bold = 0
    var italic = 0
    var underline = 0
    var index = text.startIndex
    var result: [CueSpan] = []
    func append(_ part: Substring) {
      guard !part.isEmpty else { return }
      var plain = String(part)
      for (entity, value) in [
        ("&lt;", "<"), ("&gt;", ">"), ("&nbsp;", "\u{00a0}"), ("&lrm;", ""), ("&rlm;", ""),
        ("&amp;", "&"),
      ] { plain = plain.replacingOccurrences(of: entity, with: value) }
      result.append(
        CueSpan(text: plain, bold: bold > 0, italic: italic > 0, underline: underline > 0))
    }
    for match in text.matches(of: /<\/?[a-zA-Z][^>]*>/) {
      append(text[index..<match.range.lowerBound])
      let tag = String(match.output).lowercased()
      let step = tag.hasPrefix("</") ? -1 : 1
      let name = tag.dropFirst(step == -1 ? 2 : 1).prefix { $0.isLetter }
      switch name {
      case "b": bold = max(0, bold + step)
      case "i": italic = max(0, italic + step)
      case "u": underline = max(0, underline + step)
      default: break
      }
      index = match.range.upperBound
    }
    append(text[index...])
    return result
  }
}
