#if os(tvOS)
  @_spi(Gallery) import MatineeKit
  import SwiftUI

  /// The focus rules, and the choice behind the picture look: Matinee's own
  /// lift, the system's, and the two together, which the kit takes.
  struct TVFocusPage: View {
    @Environment(TVGallerySettings.self) private var settings

    var body: some View {
      TVGalleryPage(settings.t("Focus", "Fokus")) {
        TVDemo(
          settings.t("Pictures lift", "Bilder heben sich"),
          note: settings.t(
            "Move along the row: each poster shows focus another way. The kit takes the first, the system's lift, which tilts under the thumb on the remote's touch surface and shines. Android TV's grow and ring is the second, a .tvPictureFocus(.matinee) away; the third shows why the two don't mix.",
            "Entlang der Reihe zeigt jedes Poster den Fokus anders. Das Kit nimmt das erste, das Anheben des Systems, das sich unter dem Daumen neigt und glänzt. Das zweite ist der Ring von Android TV; das dritte zeigt, warum beides nicht zusammenpasst.")
        ) {
          HStack(alignment: .top, spacing: 72) {
            ForEach(Array(Variant.allCases.enumerated()), id: \.offset) { index, variant in
              VStack(alignment: .leading, spacing: TVFocus.captionGap) {
                TVPictureButton(
                  shape: RoundedRectangle.kit(TVRadius.card), look: variant.look, ringOnLift: variant == .ringOnLift,
                  action: {}
                ) {
                  PosterArt(title: Samples.titles[index]).frame(width: 248, height: 372)
                }
                TVCaption(name(variant)).frame(width: 380, alignment: .leading)
              }
            }
          }
          .padding(.vertical, 24)
        }
        TVDemo(
          settings.t("Controls fill", "Bedienelemente füllen sich"),
          note: settings.t(
            "A button, a chip, or a row fills with the text color, its content takes the page's, and it grows a little.",
            "Schaltflächen, Chips und Zeilen füllen sich mit der Textfarbe und wachsen ein wenig.")
        ) {
          HStack(spacing: TVButtons.gap) {
            TVButton(settings.t("Play", "Abspielen"), icon: .play) {}
            TVButton(settings.t("Trailer", "Trailer"), icon: .film) {}
            TVIconButton(.heart, label: settings.t("Favorite", "Favorit")) {}
            TVChip("Drama") {}
          }
        }
      }
    }

    private enum Variant: CaseIterable {
      case system, matinee, ringOnLift

      var look: TVPictureFocus {
        switch self {
        case .system, .ringOnLift: .system
        case .matinee: .matinee
        }
      }
    }

    private func name(_ variant: Variant) -> String {
      switch variant {
      case .system: settings.t("The system's lift, the kit's", "Anheben des Systems, im Kit")
      case .matinee: settings.t("Android TV's grow and ring", "Wachsen und Ring wie Android TV")
      case .ringOnLift: settings.t("The ring on the lift, tinted", "Der Ring auf dem Anheben, getönt")
      }
    }
  }
#endif
