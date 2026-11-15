import Foundation
import Testing

/*
 * Screens build from MatineeKit, which draws things as the web app does.
 * Outside the kit, SwiftUI gives layout, text, images, navigation, and
 * gestures, none of which has a look of its own; its controls, lists,
 * sheets, alerts, menus, bars, fonts, and SF Symbols each have a kit
 * version, and a screen that reaches for one shows the system's look.
 * This is the Swift twin of Android's KitBoundaryTest.
 *
 * It scans the Swift files under a root:
 *
 *   KIT_BOUNDARY_ROOT   the folder to scan, absolute or relative to the
 *                       package; the gallery's sources unless set
 *   KIT_BOUNDARY_ALLOW  comma-separated path prefixes, relative to the
 *                       root, that may use stock controls, like `theme/`
 *
 * Through xcodebuild, prefix each with TEST_RUNNER_ (README.md, "The
 * boundary test"). Pointed at apps/ios/Matinee/UI it fails today, which
 * is expected until the screens move onto the kit.
 */

/// A stock control or look the kit replaces, and what to use instead.
struct Rule: Sendable {
  let name: String
  let pattern: String
  let instead: String

  var regex: NSRegularExpression { try! NSRegularExpression(pattern: pattern) }
}

let rules: [Rule] = [
  // Controls.
  Rule(name: "Button", pattern: #"(?<![\w.])Button\s*(\(|\{)"#, instead: "MatineeButton, RoundIconButton, Pressable"),
  Rule(name: "Toggle", pattern: #"(?<![\w.])Toggle\s*\("#, instead: "Switch, SwitchRow, Checkbox, ToggleChip"),
  Rule(name: "Picker", pattern: #"(?<![\w.])Picker\s*\("#, instead: "Select, SelectRow, SegmentedControl"),
  Rule(name: "Slider", pattern: #"(?<![\w.])Slider\s*\("#, instead: "MatineeSlider, RangeSlider"),
  Rule(name: "Stepper", pattern: #"(?<![\w.])Stepper\s*\("#, instead: "MatineeButton pair, Select"),
  Rule(name: "DatePicker", pattern: #"(?<![\w.])DatePicker\s*\("#, instead: "MatineeCalendar"),
  Rule(name: "TextField", pattern: #"(?<![\w.])(TextField|SecureField|TextEditor)\s*\("#, instead: "MatineeTextField"),
  Rule(name: "ProgressView", pattern: #"(?<![\w.])ProgressView\s*(\(|\{)"#, instead: "Spinner, ProgressBar, ProgressRing"),
  Rule(name: "Gauge", pattern: #"(?<![\w.])Gauge\s*\("#, instead: "ProgressRing"),
  Rule(name: "Menu", pattern: #"(?<![\w.])Menu\s*(\(|\{)"#, instead: ".dropdownMenu, .matineeSheet with SheetItem"),
  Rule(name: "Link", pattern: #"(?<![\w.])Link\s*\("#, instead: "MatineeButton(look: .link) with openURL"),
  Rule(name: "Label", pattern: #"(?<![\w.])Label\s*(\(|\{)"#, instead: "an HStack of LucideIcon and Text"),
  Rule(name: "Divider", pattern: #"(?<![\w.])Divider\s*\("#, instead: "Separator"),
  Rule(name: "DisclosureGroup", pattern: #"(?<![\w.])(DisclosureGroup|GroupBox|ControlGroup)\s*(\(|\{)"#, instead: "Reveal, ListSection"),
  // Lists and forms.
  Rule(name: "List", pattern: #"(?<![\w.])List\s*(\(|\{)"#, instead: "ScrollView of ListSection"),
  Rule(name: "Form", pattern: #"(?<![\w.])Form\s*(\(|\{)"#, instead: "ScrollView of ListSection, FormField"),
  Rule(name: "Section", pattern: #"(?<![\w.])Section\s*(\(|\{)"#, instead: "ListSection"),
  // Presentations.
  Rule(name: ".sheet", pattern: #"\.sheet\s*\("#, instead: ".matineeSheet"),
  Rule(name: ".alert", pattern: #"\.alert\s*\("#, instead: ".dialog, .confirmDialog"),
  Rule(name: ".confirmationDialog", pattern: #"\.confirmationDialog\s*\("#, instead: ".confirmDialog, .matineeSheet"),
  Rule(name: ".popover", pattern: #"\.popover\s*\("#, instead: ".dropdownMenu, .dialog"),
  Rule(name: ".contextMenu", pattern: #"\.contextMenu\b"#, instead: ".dropdownMenu, .matineeSheet"),
  // Bars.
  Rule(name: ".toolbar", pattern: #"\.toolbar\s*(\{|\((?!\s*\.hidden))"#, instead: ".topBar, TopBar, BottomBar"),
  Rule(name: "ToolbarItem", pattern: #"(?<![\w.])ToolbarItem(Group)?\s*\("#, instead: "TopBar's actions"),
  Rule(name: ".navigationTitle", pattern: #"\.navigationTitle\s*\("#, instead: ".topBar"),
  Rule(name: ".navigationBarTitleDisplayMode", pattern: #"\.navigationBarTitleDisplayMode\s*\("#, instead: ".topBar"),
  Rule(name: ".searchable", pattern: #"\.searchable\s*\("#, instead: "MatineeTextField(kind: .search)"),
  Rule(name: ".tabItem", pattern: #"\.tabItem\s*(\{|\()|(?<![\w.])Tab\s*\("#, instead: "BottomBar"),
  Rule(name: "UIKit appearance", pattern: #"UI(NavigationBar|TabBar|BarButtonItem|Toolbar)\.appearance\(|UI(NavigationBar|TabBar)Appearance\("#, instead: "TopBar, BottomBar"),
  // Styles: the kit's own are internal, so any style here is the system's.
  Rule(name: "control styles", pattern: #"\.(buttonStyle|toggleStyle|pickerStyle|listStyle|textFieldStyle|progressViewStyle|labelStyle|menuStyle|datePickerStyle|formStyle|gaugeStyle)\s*\("#, instead: "the kit's component"),
  // The look underneath.
  Rule(name: "SF Symbols", pattern: #"Image\s*\(\s*systemName:|systemImage:"#, instead: "LucideIcon, Image(Lucide)"),
  Rule(name: "system fonts", pattern: #"\.font\s*\(\s*\.(system|largeTitle|title|title2|title3|headline|subheadline|body|callout|footnote|caption|caption2)\b"#, instead: ".textStyle"),
  Rule(name: "system colors", pattern: #"Color\.accentColor|Color\s*\(\s*(uiColor:\s*)?(\.|UIColor\.)(system|label|secondaryLabel|tertiaryLabel)|\.(foregroundStyle|foregroundColor)\s*\(\s*\.(primary|secondary|tertiary|quaternary)\b"#, instead: "Palette"),
]

struct Finding: Sendable {
  let path: String
  let line: Int
  let rule: String
}

/// Every use of a stock control in the Swift files under `root`, except those under an `allowed` prefix.
func scan(_ root: URL, allowed: [String]) -> [Finding] {
  let compiled = rules.map { ($0.name, $0.regex) }
  var found: [Finding] = []
  let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?
    .compactMap { $0 as? URL }
    .filter { $0.pathExtension == "swift" }
    .sorted { $0.path < $1.path } ?? []
  for file in files {
    let path = String(file.standardizedFileURL.path.dropFirst(root.standardizedFileURL.path.count + 1))
    if allowed.contains(where: { path.hasPrefix($0) }) { continue }
    guard let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
    var inBlockComment = false
    for (index, raw) in text.components(separatedBy: "\n").enumerated() {
      var line = raw
      // Comments say what a thing is, including the stock control it replaces.
      if inBlockComment {
        guard let end = line.range(of: "*/") else { continue }
        line = String(line[end.upperBound...])
        inBlockComment = false
      }
      if let start = line.range(of: "/*") {
        if let end = line.range(of: "*/", range: start.upperBound..<line.endIndex) {
          line.removeSubrange(start.lowerBound..<end.upperBound)
        } else {
          line = String(line[..<start.lowerBound])
          inBlockComment = true
        }
      }
      if let comment = line.range(of: "//") { line = String(line[..<comment.lowerBound]) }
      let range = NSRange(line.startIndex..., in: line)
      for (name, regex) in compiled where regex.firstMatch(in: line, range: range) != nil {
        found.append(Finding(path: path, line: index + 1, rule: name))
      }
    }
  }
  return found
}

/// The folder to scan: KIT_BOUNDARY_ROOT, or the gallery's sources.
func boundaryRoot() -> URL {
  let package = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent()
  let environment = ProcessInfo.processInfo.environment
  guard let root = environment["KIT_BOUNDARY_ROOT"], !root.isEmpty else {
    return package.appendingPathComponent("Sources/MatineeKitGallery")
  }
  return root.hasPrefix("/") ? URL(fileURLWithPath: root) : package.appendingPathComponent(root)
}

/// What a finding list says, a count per stock control and then each use.
func report(_ found: [Finding]) -> String {
  let counts = Dictionary(grouping: found, by: \.rule).mapValues(\.count).sorted { $0.value > $1.value }
  let instead = Dictionary(uniqueKeysWithValues: rules.map { ($0.name, $0.instead) })
  let summary = counts.map { "  \($0.key): \($0.value) (use \(instead[$0.key] ?? "the kit"))" }.joined(separator: "\n")
  let lines = found.map { "  \($0.path):\($0.line) uses \($0.rule)" }.joined(separator: "\n")
  return "\(found.count) uses of stock controls outside the kit:\n\(summary)\n\nEach:\n\(lines)"
}

@Test func onlyTheKitDrawsControls() throws {
  let root = boundaryRoot()
  var isDirectory: ObjCBool = false
  #expect(
    FileManager.default.fileExists(atPath: root.path, isDirectory: &isDirectory) && isDirectory.boolValue,
    "no sources at \(root.path)")
  let allowed = (ProcessInfo.processInfo.environment["KIT_BOUNDARY_ALLOW"] ?? "")
    .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
  let found = scan(root, allowed: allowed)
  if !found.isEmpty { print(report(found)) }
  #expect(found.isEmpty, "Use the MatineeKit version instead.\n\(report(found))")
}

/// The scanner itself: it catches stock controls and lets comments and the kit's own names through.
@Test func theScannerTellsStockFromKit() throws {
  let folder = FileManager.default.temporaryDirectory.appendingPathComponent("kit-boundary-\(UUID().uuidString)")
  try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: folder) }
  let source = """
    // A Button( in a comment is fine, as is Toggle( in /* this */ one.
    MatineeButton("Play") {}
    RoundIconButton(.x, label: "Close") {}
    Button("Stock") {}
    Toggle("On", isOn: $on)
    List { Text("a") }
    ListSection("Fine") {}
    .toolbar(.hidden, for: .navigationBar)
    .toolbar { ToolbarItem(placement: .topBarTrailing) {} }
    Image(systemName: "xmark")
    Text("x").font(.headline)
    .sheet(isPresented: $open) {}
    .matineeSheet(isPresented: $open) {}
    """
  try source.write(to: folder.appendingPathComponent("Screen.swift"), atomically: true, encoding: .utf8)
  let found = scan(folder, allowed: [])
  let names = Set(found.map(\.rule))
  #expect(names == ["Button", "Toggle", "List", ".toolbar", "ToolbarItem", "SF Symbols", "system fonts", ".sheet"])
  #expect(found.allSatisfy { $0.line > 3 })
}
