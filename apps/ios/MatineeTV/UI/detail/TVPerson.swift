import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvPerson.kt: someone in the cast or crew on a TV, and everything they're
 * in here. Their portrait beside their name, what they're known for, and
 * their biography; then their credits a row for each kind, what they're
 * known for first, as MatineeCore's person helpers arrange them
 * (Title/PersonPresentation.swift), each poster with the year and the part
 * under it. The focused title's backdrop goes behind the page. Focus
 * starts on the first credit, with the header still in view.
 *
 * The phone's choice of movies or shows is left out: the rows already
 * sort the credits, and a row of chips would be one more stop between the
 * name and the titles.
 */

struct TVPersonScreen: View {
  let name: String
  /// The provider's id, from a credit that has one: it tells apart two people of one name.
  var tmdbId: String?
  @State private var person = Loader<Person>()
  @Environment(\.palette) private var palette

  var body: some View {
    let (name, tmdbId) = (name, tmdbId)
    DetailState(loader: person, error: Str.personLoadFailed) { person in TVPersonPage(person: person) }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .background(palette.background)
      .ignoresSafeArea()
      .loads(person) { api in
        #if DEBUG
          if BrowseFixtures.on { return try await BrowseFixtures.person(name, api: api) }
        #endif
        return try await loadPerson(api, name: name, tmdbId: tmdbId)
      }
  }
}

private func sectionKey(_ section: PersonCreditSection) -> String { "credits-\(section.kind)" }

/// A credit's card key in its row: a title can be in a section twice, for two parts.
private func creditKey(_ index: Int, _ credit: PersonCredit) -> String { "\(index)-\(credit.title.id)" }

private struct TVPersonPage: View {
  let person: Person
  @State private var memory = TVFocusMemory()
  @Environment(\.api) private var api

  var body: some View {
    let sections = personCreditSections(person)
    let first = sections.first
    ZStack(alignment: .topLeading) {
      DetailBackdrop(sources: [api?.art(focusedTitle(sections)?.images.backdrop, size: .large)].compactMap(\.self))
      // The first row keeps the header in view: who this is matters as much as the first title.
      DetailScroll(memory: memory, headerRows: [first.map(sectionKey) ?? ""]) {
        PersonHeader(person: person)
      } rows: {
        ForEach(sections, id: \.kind) { section in
          CreditsRow(section: section, memory: memory)
        }
      }
    }
    .tvPageFocus(memory) { first.flatMap { section in section.credits.first.map { (sectionKey(section), creditKey(0, $0)) } } }
  }

  /// The title of the credit focus is on, for the backdrop.
  private func focusedTitle(_ sections: [PersonCreditSection]) -> TitleSummary? {
    guard let row = memory.lastRow, let item = memory.lastItem,
      let section = sections.first(where: { sectionKey($0) == row })
    else { return nil }
    return section.credits.enumerated().first { creditKey($0.offset, $0.element) == item }?.element.title
  }
}

/// The portrait beside the name, what they're known for, and the biography.
private struct PersonHeader: View {
  let person: Person
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette

  var body: some View {
    let biography = person.profile?.biography.flatMap { $0.isEmpty ? nil : $0 }
    HeaderColumn {
      HStack(alignment: .top, spacing: TVSpace.s8) {
        Circle().fill(palette.secondary)
          .overlay {
            Text(initials(person.name)).textStyle(.display).foregroundStyle(palette.mutedForeground)
          }
          .overlay { Picture(api?.art(person.photo, size: .medium)) }
          .clipShape(Circle())
          .frame(width: 240, height: 240)
          .shadow(color: .black.opacity(0.25), radius: 16, y: 8)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 0) {
          Text(person.name).textStyle(.hero).lineLimit(1).minimumScaleFactor(0.8)
            .accessibilityAddTraits(.isHeader)
          Text(subtitle).textStyle(.facts).foregroundStyle(palette.foreground.opacity(0.85)).lineLimit(1)
            .padding(.top, 4)
          if let biography {
            Text(biography).textStyle(.body).foregroundStyle(palette.foreground.opacity(0.78)).lineLimit(3)
              .frame(maxWidth: 1240, alignment: .leading)
              .padding(.top, TVSpace.s4)
          }
        }
      }
    }
  }

  /// "Acting · Born Sep 2, 1964", or "Actor, Director · 12 titles".
  private var subtitle: String {
    switch personSubtitle(person) {
    case .profile(let knownFor, let born, let died):
      return [
        knownFor.flatMap(departmentName), formatDay(born).map(Str.personBorn), formatDay(died).map(Str.personDied),
      ].compactMap(\.self).joined(separator: "  ·  ")
    case .credits(let kinds, let count):
      let names = kinds.map { titleCreditLabel($0, count: 1) }.formatted(.list(type: .and).locale(.app))
      return [names.isEmpty ? nil : names, Str.browseTitleCount(count)].compactMap(\.self).joined(separator: "  ·  ")
    }
  }
}

/// One kind of credit as a row of posters, with the year and the part under each.
private struct CreditsRow: View {
  let section: PersonCreditSection
  let memory: TVFocusMemory
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(ViewerState.self) private var viewer: ViewerState?

  private struct Keyed {
    let key: String
    let credit: PersonCredit
  }

  var body: some View {
    let key = sectionKey(section)
    let credits = section.credits.enumerated().map { Keyed(key: creditKey($0.offset, $0.element), credit: $0.element) }
    TVRow(sectionName(section.kind), key: key, items: credits, itemKey: \.key, memory: memory) { keyed in
      let credit = keyed.credit
      let detail = personCreditDetail(credit)
      let line = [formatYear(detail.year), detail.role].compactMap(\.self).joined(separator: " · ")
      let target = TVActionTarget.title(credit.title)
      TVCaptionedPoster(
        credit.title.name, detail: line.isEmpty ? nil : line,
        watched: viewer?.isWatched(credit.title) ?? credit.title.watched, action: { nav.title(credit.title) },
        onLongPress: { actions?.open(target) },
        onPlayPause: { actions?.play(target, api: api, viewer: viewer, nav: nav, snackbar: snackbar) }
      ) {
        Picture(api?.art(credit.title.images.poster, size: .medium))
      }
    }
    .detailRow(key)
  }

  /// "Acting", "Directing": the web's section names, which are TMDB's departments' words.
  private func sectionName(_ kind: String) -> String {
    switch kind {
    case CreditKind.director: Str.personDepartmentDirecting
    case CreditKind.writer: Str.personDepartmentWriting
    case CreditKind.creator: Str.iosPeopleSectionCreator
    default: Str.personDepartmentActing
    }
  }
}

/// What TMDB says someone is known for, in the app's language.
private func departmentName(_ id: String) -> String? {
  switch id {
  case PersonDepartment.acting: Str.personDepartmentActing
  case PersonDepartment.directing: Str.personDepartmentDirecting
  case PersonDepartment.writing: Str.personDepartmentWriting
  case PersonDepartment.creator: Str.personDepartmentCreator
  case PersonDepartment.production: Str.personDepartmentProduction
  case PersonDepartment.editing: Str.personDepartmentEditing
  case PersonDepartment.camera: Str.personDepartmentCamera
  case PersonDepartment.sound: Str.personDepartmentSound
  case PersonDepartment.art: Str.personDepartmentArt
  case PersonDepartment.costume: Str.personDepartmentCostume
  case PersonDepartment.visualEffects: Str.personDepartmentVisualEffects
  case PersonDepartment.lighting: Str.personDepartmentLighting
  case PersonDepartment.crew: Str.personDepartmentCrew
  default: nil
  }
}
