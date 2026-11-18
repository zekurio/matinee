// TEMPORARY: ways to show something under a window's content view, and
// what each does to the title bar. Takes screenshots along the way.
import AppKit

let variant = CommandLine.arguments[1]
let shots = CommandLine.arguments[2]
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 100, y: 200, width: 600, height: 300),
                      styleMask: [.titled, .closable, .miniaturizable, .resizable],
                      backing: .buffered, defer: false)
window.title = "Probe \(variant)"
window.isOpaque = false
window.backgroundColor = .clear
let content = NSView(frame: .zero)
content.wantsLayer = true
content.layer?.backgroundColor = NSColor(red: 0, green: 0, blue: 1, alpha: 0.3).cgColor
// Stands in for something the page draws: opaque, to see its shadow.
let badge = CALayer()
badge.frame = CGRect(x: 40, y: 200, width: 160, height: 50)
badge.backgroundColor = NSColor.systemPink.cgColor
content.layer?.addSublayer(badge)
window.contentView = content
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)

func describe(_ layer: CALayer?, _ depth: Int = 0) {
    guard let layer = layer, depth < 4 else { return }
    print(String(repeating: "  ", count: depth), type(of: layer), layer.delegate.map { String(describing: type(of: $0)) } ?? "-", layer.frame)
    for sub in layer.sublayers ?? [] { describe(sub, depth + 1) }
}

func shot(_ name: String) {
    let capture = Process()
    capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    capture.arguments = ["-x", "\(shots)/\(variant)-\(name).png"]
    try? capture.run()
    capture.waitUntilExit()
}

let under = CALayer()
under.backgroundColor = NSColor.systemGreen.cgColor
var child: NSWindow?

func place() {
    switch variant {
    case "layer":
        // A layer of ours under the content view's, in whatever holds it.
        guard let layer = content.layer, let holder = layer.superlayer else { return }
        under.frame = layer.frame
        holder.insertSublayer(under, below: layer)
    case "child":
        // A window of ours under the window.
        let rect = window.convertToScreen(content.convert(content.bounds, to: nil))
        if child == nil {
            let made = NSWindow(contentRect: rect, styleMask: [.borderless], backing: .buffered, defer: false)
            made.backgroundColor = .systemGreen
            window.addChildWindow(made, ordered: .below)
            child = made
        }
        child?.setFrame(rect, display: true)
    case "destover":
        // A subview that draws behind what is there already.
        if under.superlayer == nil {
            let view = NSView(frame: content.bounds)
            view.autoresizingMask = [.width, .height]
            view.wantsLayer = true
            view.layer?.backgroundColor = NSColor.systemGreen.cgColor
            view.layer?.compositingFilter = "destOver"
            content.addSubview(view)
            content.layer?.addSublayer(under)
            under.isHidden = true
        }
    default:
        break
    }
}

place()
print("=== \(variant): layers from the content view's holder")
describe(content.layer?.superlayer ?? content.layer)

let steps: [(Double, () -> Void)] = [
    (1.5, { shot("1-shown") }),
    (2.0, { window.setFrame(NSRect(x: 80, y: 150, width: 760, height: 420), display: true); if variant == "child" { place() } }),
    (3.0, { shot("2-resized"); describe(content.layer?.superlayer ?? content.layer) }),
    (3.2, { window.toggleFullScreen(nil) }),
    (6.5, { if variant == "child" { place() }; shot("3-fullscreen") }),
    (7.0, { window.toggleFullScreen(nil) }),
    (10.5, { if variant == "child" { place() }; shot("4-back"); describe(content.layer?.superlayer ?? content.layer) }),
    (11.0, { exit(0) }),
]
for (after, step) in steps {
    DispatchQueue.main.asyncAfter(deadline: .now() + after, execute: step)
}
app.run()
