#if os(tvOS)
  import SwiftUI

  /// A title as its logo, fitted into `width` by `height` at `alignment`,
  /// or as its name in `style` when it has none or the logo won't load. A
  /// logo is see-through, so nothing is drawn under it.
  ///
  ///     TVTitleLogo("Dune", url: logo)
  ///     TVTitleLogo("Dune") { cachedLogo }   // the app's own image
  public struct TVTitleLogo<Logo: View>: View {
    let name: String
    let url: URL?
    let style: TVTextStyle
    let width: CGFloat
    let height: CGFloat
    let alignment: Alignment
    let logo: (() -> Logo)?

    public var body: some View {
      Group {
        if let logo {
          logo().frame(maxWidth: width, maxHeight: height, alignment: alignment)
            .accessibilityLabel(name)
        } else if let url {
          AsyncImage(url: url, transaction: Transaction(animation: Motion.image)) { phase in
            switch phase {
            case .success(let image):
              image.resizable().aspectRatio(contentMode: .fit)
                .frame(maxWidth: width, maxHeight: height, alignment: alignment)
                .accessibilityLabel(name)
            case .failure: nameText
            default: Color.clear.frame(width: width, height: height)
            }
          }
        } else {
          nameText
        }
      }
      .frame(width: width, height: height, alignment: alignment)
    }

    private var nameText: some View {
      Text(name).textStyle(style).lineLimit(2).minimumScaleFactor(0.8)
        .frame(maxWidth: width, maxHeight: height, alignment: alignment)
        .accessibilityAddTraits(.isHeader)
    }
  }

  extension TVTitleLogo where Logo == EmptyView {
    /// The name alone, or the logo loaded from `url`. 720 by 140 at the
    /// bottom leading corner, Android TV's 360 by 70 dp, unless given.
    public init(
      _ name: String, url: URL? = nil, style: TVTextStyle = .display, width: CGFloat = 720, height: CGFloat = 140,
      alignment: Alignment = .bottomLeading
    ) {
      self.name = name
      self.url = url
      self.style = style
      self.width = width
      self.height = height
      self.alignment = alignment
      self.logo = nil
    }
  }

  extension TVTitleLogo {
    /// A logo the app drew or loaded itself.
    public init(
      _ name: String, width: CGFloat = 720, height: CGFloat = 140, alignment: Alignment = .bottomLeading,
      @ViewBuilder logo: @escaping () -> Logo
    ) {
      self.name = name
      self.url = nil
      self.style = .display
      self.width = width
      self.height = height
      self.alignment = alignment
      self.logo = logo
    }
  }
#endif
