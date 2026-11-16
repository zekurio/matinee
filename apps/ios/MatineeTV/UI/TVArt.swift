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
/// name in the display style when it has none or the logo won't load: the
/// kit's `TVTitleLogo` with the logo loaded as the rest of the art is.
struct TVLogo: View {
  let name: String
  let source: ImageSource?
  var width: CGFloat = 720
  var height: CGFloat = 140

  var body: some View {
    if let source {
      TVTitleLogo(name, width: width, height: height) {
        LogoImage(name: name, source: source, width: width, height: height)
      }
    } else {
      TVTitleLogo(name, width: width, height: height)
    }
  }
}

private struct LogoImage: View {
  let name: String
  let source: ImageSource
  let width: CGFloat
  let height: CGFloat
  @Environment(\.imagePipeline) private var pipeline

  var body: some View {
    LazyImage(request: ImageRequest(url: source.url), transaction: Transaction(animation: Motion.image)) { state in
      if let image = state.image {
        image.resizable().aspectRatio(contentMode: .fit)
          .frame(maxWidth: width, maxHeight: height, alignment: .bottomLeading)
          .transition(.opacity)
      } else if state.error != nil {
        // As the kit's own: the name, when the logo won't come.
        TVTitleLogo(name, width: width, height: height)
      } else {
        Color.clear
      }
    }
    .pipeline(pipeline)
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
