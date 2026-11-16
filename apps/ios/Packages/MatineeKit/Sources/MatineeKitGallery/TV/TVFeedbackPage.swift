#if os(tvOS)
  import MatineeKit
  import SwiftUI

  /// What a TV page says when it has nothing else to show, and what pops up
  /// over it: notices in a row's place, a page's one message, the loading
  /// row, toasts, a dialog, and the text field.
  struct TVFeedbackPage: View {
    @Environment(TVGallerySettings.self) private var settings
    @State private var toasts = ToastState()
    @State private var asking = false
    @State private var confirming = false
    @State private var address = ""
    @State private var log = ""

    var body: some View {
      TVGalleryPage(settings.t("Notices, toasts, dialogs", "Hinweise, Toasts, Dialoge")) {
        TVDemo(
          settings.t("Toasts", "Toasts"),
          note: settings.t(
            "The phone's ToastState at a TV's size, between the drawer's rail and the right margin. Nothing in it takes focus.",
            "Der ToastState des Telefons in TV-Größe. Nichts darin nimmt den Fokus.")
        ) {
          HStack(spacing: TVButtons.gap) {
            TVButton(settings.t("Plain", "Schlicht")) {
              toasts.post(ToastMessage(settings.t("Added to favorites", "Zu Favoriten hinzugefügt")))
            }
            TVButton(settings.t("Success", "Erfolg"), icon: .circleCheck) {
              toasts.post(ToastMessage(settings.t("Marked watched", "Als gesehen markiert"), kind: .success))
            }
            TVButton(settings.t("Error", "Fehler"), icon: .octagonX) {
              toasts.post(
                ToastMessage(
                  settings.t("Couldn't mark as watched", "Konnte nicht als gesehen markiert werden"),
                  description: settings.t("The server didn't answer.", "Der Server hat nicht geantwortet."),
                  kind: .error))
            }
          }
        }
        TVDemo(
          settings.t("Dialog", "Dialog"),
          note: settings.t(
            "For what stops everything. Focus starts on the safe answer; Menu closes it.",
            "Für das, was alles anhält. Der Fokus beginnt auf der sicheren Antwort; Menü schließt ihn.")
        ) {
          HStack(spacing: TVButtons.gap) {
            TVButton(settings.t("Sign out", "Abmelden"), icon: .logOut) { asking = true }
            TVButton(settings.t("Remove server", "Server entfernen"), icon: .trash) { confirming = true }
            if !log.isEmpty { TVCaption(log) }
          }
        }
        TVDemo(
          settings.t("Text field", "Textfeld"),
          note: settings.t(
            "Rests like a row; Select opens the system's keyboard. Red while what was typed didn't work.",
            "Ruht wie eine Zeile; Auswählen öffnet die Systemtastatur. Rot, solange das Getippte nicht ging.")
        ) {
          VStack(alignment: .leading, spacing: TVListItems.gap) {
            TVTextField(text: $address, placeholder: "media.example.com", icon: .server, kind: .url)
            TVTextField(text: .constant("nas.local:8420"), placeholder: "media.example.com", icon: .server, kind: .url, isError: true)
          }
          .frame(width: 1000)
        }
        TVDemo(settings.t("Row notices", "Hinweise in Reihen")) {
          VStack(alignment: .leading, spacing: TVSpace.rows) {
            TVRowNotice(settings.t("Recently added in Movies", "Neu in Filme"))
            TVRowNotice(
              settings.t("Continue watching", "Weiterschauen"),
              headline: settings.t("Couldn't load Continue watching", "Weiterschauen konnte nicht geladen werden"),
              message: settings.t("The server didn't answer.", "Der Server hat nicht geantwortet."),
              action: TVNoticeAction(settings.t("Try again", "Erneut versuchen"), icon: .refreshCw) {})
            TVRowNotice(
              settings.t("Recently added in Shows", "Neu in Serien"), headline: settings.t("Nothing here yet.", "Noch nichts hier."))
            TVLoadingRow()
          }
          .padding(.leading, -TVPage.start)
        }
        TVDemo(settings.t("A page's one message", "Die eine Meldung einer Seite")) {
          TVMessage(
            settings.t("No libraries yet", "Noch keine Mediatheken"),
            message: settings.t(
              "Add a folder of videos on this server to start watching.",
              "Füge auf diesem Server einen Ordner mit Videos hinzu, um loszulegen."),
            icon: .folderPlus, centered: false,
            action: TVNoticeAction(settings.t("Try again", "Erneut versuchen"), icon: .refreshCw) {}
          )
          .padding(.leading, -TVPage.start)
        }
      }
      .tvToastHost(toasts)
      .tvDialog(
        isPresented: $asking, title: settings.t("Sign out of Matinee?", "Von Matinee abmelden?"),
        message: settings.t(
          "You'll need a code from your phone to sign this TV in again.",
          "Um diesen Fernseher wieder anzumelden, brauchst du einen Code von deinem Telefon."),
        buttons: [
          TVDialogButton(settings.t("Sign out", "Abmelden"), icon: .logOut, destructive: true) {
            log = settings.t("Signed out", "Abgemeldet")
          },
          TVDialogButton(settings.t("Cancel", "Abbrechen"), icon: .x, preferred: true) {
            log = settings.t("Cancelled", "Abgebrochen")
          },
        ]
      )
      .tvConfirmDialog(
        isPresented: $confirming, title: settings.t("Remove nas.local?", "nas.local entfernen?"),
        message: settings.t(
          "Matinee signs out there and forgets the server on this TV.",
          "Matinee meldet sich dort ab und vergisst den Server auf diesem Fernseher."),
        confirm: settings.t("Remove", "Entfernen"), confirmIcon: .trash, cancel: settings.t("Cancel", "Abbrechen")
      ) {
        log = settings.t("Removed", "Entfernt")
      }
      .onAppear {
        switch settings.open {
        case "toast": toasts.post(ToastMessage(settings.t("Marked watched", "Als gesehen markiert"), kind: .success))
        case "dialog": asking = true
        default: break
        }
        settings.open = nil
      }
    }
  }
#endif
