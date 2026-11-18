// TEMPORARY: shows a titled window, with a view beside its content view
// or not, and takes a screenshot. To see what moves the title.
import AppKit

let variant = CommandLine.arguments[1]
let shot = CommandLine.arguments[2]
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 100, y: 200, width: 600, height: 300),
                      styleMask: [.titled, .closable, .miniaturizable, .resizable],
                      backing: .buffered, defer: false)
window.title = "Probe \(variant)"
let content = NSView(frame: .zero)
content.wantsLayer = true
content.layer?.backgroundColor = NSColor(red: 0, green: 0, blue: 1, alpha: 0.3).cgColor
window.contentView = content
if variant.contains("clear") {
    window.isOpaque = false
    window.backgroundColor = .clear
}
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
if variant.contains("sibling") {
    let host = NSView(frame: content.frame)
    host.wantsLayer = true
    host.layer?.backgroundColor = NSColor.systemGreen.cgColor
    content.superview!.addSubview(host, positioned: .below, relativeTo: content)
    host.frame = content.frame
    if variant.contains("twice") {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            content.superview!.addSubview(host, positioned: .below, relativeTo: content)
            host.frame = content.frame
        }
    }
    print(variant, "subviews:", content.superview!.subviews.map { String(describing: type(of: $0)) })
}
DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
    let capture = Process()
    capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    capture.arguments = ["-x", shot]
    try? capture.run()
    capture.waitUntilExit()
    exit(0)
}
app.run()
