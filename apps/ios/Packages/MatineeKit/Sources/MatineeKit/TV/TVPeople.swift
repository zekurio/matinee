#if os(tvOS)
  import SwiftUI

  /// How wide a `TVPersonCard` is.
  public let TVPersonWidth: CGFloat = 224

  /// Someone in a title's cast or crew: a round photo, their initials until
  /// it's in, and their name and role under it. The photo takes focus.
  ///
  ///     TVPersonCard("Zendaya", role: "Chani", url: photo) { open(person) }
  public struct TVPersonCard<Photo: View>: View {
    let name: String
    let role: String?
    let action: () -> Void
    @ViewBuilder let photo: () -> Photo
    @Environment(\.palette) private var palette

    public init(_ name: String, role: String? = nil, action: @escaping () -> Void, @ViewBuilder photo: @escaping () -> Photo) {
      self.name = name
      self.role = role
      self.action = action
      self.photo = photo
    }

    public var body: some View {
      VStack(spacing: 0) {
        TVPictureButton(shape: Circle(), action: action) {
          Circle().fill(palette.secondary)
            .overlay {
              Text(Avatar<EmptyView>.initials(name)).textStyle(.headline).foregroundStyle(palette.mutedForeground)
            }
            .overlay { photo() }
            .aspectRatio(1, contentMode: .fit)
        }
        .accessibilityLabel([name, role].compactMap { $0 }.joined(separator: ", "))
        Text(name).textStyle(.label).lineLimit(1)
          .padding(.top, TVFocus.captionGap)
        if let role {
          Text(role).textStyle(.caption).foregroundStyle(palette.mutedForeground).lineLimit(1)
        }
      }
      .multilineTextAlignment(.center)
      .frame(width: TVPersonWidth)
    }
  }
#endif
