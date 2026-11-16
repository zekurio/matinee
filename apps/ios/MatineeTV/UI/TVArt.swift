import MatineeCore
import MatineeKit
import Nuke
import NukeUI
import SwiftUI

/*
 * Artwork on a TV: the iPhone app's `Picture` (Matinee/UI/components/
 * Picture.swift), which loads through Nuke with the session's sign-in,
 * keeps what it loaded in memory and on disk, and fades in over the blur
 * hash. The kit's TV cards take any view as their art, so a card here is
 * the kit's card with a `Picture` in it, never the kit's `TVPicture`,
 * which is a plain `AsyncImage` for the gallery.
 *
 *     TVPosterCard(title.name, action: open) { Picture(api?.art(title.images.poster)) }
 */

/// A title's logo, from the server, fitted into `width` by `height`, or its
/// name in `style`, `nameWidth` wide, when it has none or the logo won't
/// load: Android TV's `TvTitleLogo`, the kit's `TVTitleLogo` with the logo
/// loaded as the rest of the art is.
struct TVLogo: View {
  let name: String
  let source: ImageSource?
  var width: CGFloat = 720
  var height: CGFloat = 140
  var style: TVTextStyle = .display
  /// The name's width when it stands in, as Android TV gives the name its own; `width` unless set.
  var nameWidth: CGFloat?
  @State private var failed: URL?

  var body: some View {
    if let source, failed != source.url {
      TVTitleLogo(name, width: width, height: height) {
        LogoImage(source: source) { failed = source.url }
      }
    } else {
      TVTitleLogo(name, style: style, width: nameWidth ?? width, height: height)
    }
  }
}

private struct LogoImage: View {
  let source: ImageSource
  let onFailure: () -> Void
  @Environment(\.imagePipeline) private var pipeline

  var body: some View {
    LazyImage(request: ImageRequest(url: source.url), transaction: Transaction(animation: Motion.image)) { state in
      if let image = state.image {
        image.resizable().aspectRatio(contentMode: .fit).transition(.opacity)
      } else {
        Color.clear
      }
    }
    .pipeline(pipeline)
    // The name takes its place, in its own style and width, when the logo won't come.
    .onCompletion { result in if case .failure = result { onFailure() } }
    .id(source.url)
  }
}

/// The signed-in person's picture, initials until it's in.
struct TVAvatar: View {
  let user: User
  var size: CGFloat = 64
  @Environment(\.api) private var api

  var body: some View {
    Avatar(user.name, size: size) {
      Picture(user.avatarId.flatMap { id in api.flatMap { ImageSource($0.paths.avatar(id)) } })
    }
  }
}
