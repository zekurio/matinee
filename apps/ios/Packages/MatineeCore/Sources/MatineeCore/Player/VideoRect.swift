import Foundation

/// Where the video shows in `bounds`: fitted inside, or covering it when it fills.
public nonisolated func videoRect(aspect: Double, in bounds: CGSize, fill: Bool) -> CGRect {
  guard aspect > 0, bounds.width > 0, bounds.height > 0 else { return CGRect(origin: .zero, size: bounds) }
  let box = bounds.width / bounds.height
  let wide = fill ? aspect < box : aspect > box
  let width = wide ? bounds.width : bounds.height * aspect
  let height = wide ? bounds.width / aspect : bounds.height
  return CGRect(x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width: width, height: height)
}
