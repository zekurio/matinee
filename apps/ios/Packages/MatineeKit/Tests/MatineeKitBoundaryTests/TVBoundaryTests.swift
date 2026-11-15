import Foundation
import Testing

/*
 * TV screens build from the kit's TV components (Sources/MatineeKit/TV),
 * as phone screens build from its phone ones. The phone's are sized for a
 * finger at arm's length and some, like sheets and the bottom bar, have
 * no place on a TV at all; they still compile for tvOS, so this test is
 * what keeps a TV screen from reaching for one. It reuses the boundary
 * test's scanner, so a TV screen is held to that test's rules as well.
 *
 *   KIT_TV_BOUNDARY_ROOT   the folder of TV screens to scan, absolute or
 *                          relative to the package; the TV gallery unless set
 *
 * Through xcodebuild, prefix it with TEST_RUNNER_ (README.md, "TV").
 */

/// Phone components, and phone sizes, a TV screen uses the TV version of.
let tvRules: [Rule] = [
  Rule(name: "matineeSheet", pattern: #"\.matineeSheet\s*\("#, instead: ".tvSidePanel, .tvActionsPanel, .tvOptionsPanel"),
  Rule(name: "dropdownMenu", pattern: #"\.dropdownMenu\s*\("#, instead: ".tvOptionsPanel, .tvActionsPanel"),
  Rule(name: "BottomBar", pattern: #"(?<![\w.])BottomBar\s*\(|\.bottomBar\s*\("#, instead: "TVNavDrawer"),
  Rule(name: "TopBar", pattern: #"(?<![\w.])TopBar\s*\(|\.topBar\s*\("#, instead: "a .headline title; Menu goes back"),
  Rule(name: "MatineeButton", pattern: #"(?<![\w.])(MatineeButton|RoundIconButton|Pressable)\s*(\(|\{)"#, instead: "TVButton, TVIconButton, TVRoundButton, TVControlButton, TVPictureButton"),
  Rule(name: "Chip", pattern: #"(?<![\w.])(Chip|ChoiceChip|ToggleChip)\s*\("#, instead: "TVChip"),
  Rule(name: "ListRow", pattern: #"(?<![\w.])(ListSection|ListRow|SwitchRow|SelectRow|ValueRow|ListBlock)\s*(\(|\{)"#, instead: "TVListItem, TVListHeading, TVListValue, TVListSwitch"),
  Rule(name: "MatineeTextField", pattern: #"(?<![\w.])MatineeTextField\s*\("#, instead: "TVSearchField"),
  Rule(name: "phone inputs", pattern: #"(?<![\w.])(Select|SegmentedControl|Switch|Checkbox|MatineeSlider|RangeSlider|MatineeCalendar)\s*\("#, instead: "TVListItem with TVListValue or TVListSwitch, .tvOptionsPanel, TVStepRow"),
  Rule(name: "phone type", pattern: #"\.textStyle\(\s*\.(px\d+|xs|sm|base|lg|xl|xl2|xl3|xl4|xl5)\b"#, instead: ".textStyle(.body), .title, .headline, and the rest of TVTextStyle"),
]

/// The folder to scan: KIT_TV_BOUNDARY_ROOT, or the TV gallery's sources.
func tvBoundaryRoot() -> URL {
  let package = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent()
  guard let root = ProcessInfo.processInfo.environment["KIT_TV_BOUNDARY_ROOT"], !root.isEmpty else {
    return package.appendingPathComponent("Sources/MatineeKitGallery/TV")
  }
  return root.hasPrefix("/") ? URL(fileURLWithPath: root) : package.appendingPathComponent(root)
}

/// Every use of a phone component in the Swift files under `root`.
func scanTV(_ root: URL) -> [Finding] {
  let compiled = tvRules.map { ($0.name, $0.regex) }
  let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?
    .compactMap { $0 as? URL }
    .filter { $0.pathExtension == "swift" }
    .sorted { $0.path < $1.path } ?? []
  var found: [Finding] = []
  for file in files {
    let path = String(file.standardizedFileURL.path.dropFirst(root.standardizedFileURL.path.count + 1))
    guard let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
    for (index, raw) in text.components(separatedBy: "\n").enumerated() {
      let line = raw.range(of: "//").map { String(raw[..<$0.lowerBound]) } ?? raw
      let range = NSRange(line.startIndex..., in: line)
      for (name, regex) in compiled where regex.firstMatch(in: line, range: range) != nil {
        found.append(Finding(path: path, line: index + 1, rule: name))
      }
    }
  }
  return found
}

@Test func tvScreensUseTheTVKit() throws {
  let root = tvBoundaryRoot()
  var isDirectory: ObjCBool = false
  #expect(
    FileManager.default.fileExists(atPath: root.path, isDirectory: &isDirectory) && isDirectory.boolValue,
    "no sources at \(root.path)")
  let found = scanTV(root) + scan(root, allowed: [])
  let instead = Dictionary(uniqueKeysWithValues: (tvRules + rules).map { ($0.name, $0.instead) })
  let lines = found.map { "  \($0.path):\($0.line) uses \($0.rule) (use \(instead[$0.rule] ?? "the TV kit"))" }
  if !found.isEmpty { print(lines.joined(separator: "\n")) }
  #expect(found.isEmpty, "Use the kit's TV version instead.\n\(lines.joined(separator: "\n"))")
}

/// The TV scanner catches phone components and lets the TV ones through.
@Test func theTVScannerTellsPhoneFromTV() throws {
  let folder = FileManager.default.temporaryDirectory.appendingPathComponent("kit-tv-boundary-\(UUID().uuidString)")
  try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: folder) }
  let source = """
    TVButton("Play") {}
    TVChip("Drama") {}
    Text("x").textStyle(.title)
    MatineeButton("Play") {}
    Chip("Drama") {}
    .matineeSheet(isPresented: $open) {}
    Text("x").textStyle(.sm, weight: .medium)
    // ListRow("in a comment") {}
    """
  try source.write(to: folder.appendingPathComponent("Screen.swift"), atomically: true, encoding: .utf8)
  let found = scanTV(folder)
  #expect(Set(found.map(\.rule)) == ["MatineeButton", "Chip", "matineeSheet", "phone type"])
  #expect(found.allSatisfy { $0.line > 3 })
}
