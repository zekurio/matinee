import Foundation

/*
 * The person page's presentation, after the web's people.$name.tsx and
 * Android's PersonScreen in BrowseScreen.kt: the line under the name, the
 * credits in a section for each kind, what they're known for first, and
 * the choice of movies or shows. The app words each
 * (Matinee/UI/browse/PersonScreen.swift).
 */

/// The line under a person's name: what TMDB knows of them, "Acting ·
/// Born Sep 2, 1964", or without that, the kinds of credit they have here
/// and on how many titles.
public enum PersonSubtitle: Hashable, Sendable {
  /// A `PersonDepartment` the app has a word for, and YYYY-MM-DD days.
  case profile(knownFor: String?, born: String?, died: String?)
  /// `CreditKind`s, what they're known for first.
  case credits(kinds: [String], titleCount: Int)
}

public func personSubtitle(_ person: Person) -> PersonSubtitle {
  if let profile = person.profile {
    let knownFor = profile.knownFor.flatMap { PersonDepartment.knownValues.contains($0) ? $0 : nil }
    let born = profile.birthday.flatMap { $0.isEmpty ? nil : $0 }
    let died = profile.deathday.flatMap { $0.isEmpty ? nil : $0 }
    // A profile that knows none of these says nothing; the credits say something.
    if knownFor != nil || born != nil || died != nil {
      return .profile(knownFor: knownFor, born: born, died: died)
    }
  }
  return .credits(kinds: personCreditKinds(person), titleCount: person.titleCount)
}

/// The kinds of credit someone has here, what they're known for first, then the contract's order.
public func personCreditKinds(_ person: Person) -> [String] {
  let present = Set(person.credits.map(\.kind))
  return ([person.kind] + CreditKind.knownValues.filter { $0 != person.kind }).filter(present.contains)
}

/// One kind of credit's titles, in the server's order.
public struct PersonCreditSection: Hashable, Sendable {
  /// A `CreditKind`.
  public let kind: String
  public let credits: [PersonCredit]
}

/// The credits as sections, one for each kind they have, what they're
/// known for first; with `titleKind`, only that kind of title. Sections
/// left with nothing are left out.
public func personCreditSections(_ person: Person, titleKind: String? = nil) -> [PersonCreditSection] {
  let shown = titleKind.map { kind in person.credits.filter { $0.title.kind == kind } } ?? person.credits
  return personCreditKinds(person).compactMap { kind in
    let credits = shown.filter { $0.kind == kind }
    return credits.isEmpty ? nil : PersonCreditSection(kind: kind, credits: credits)
  }
}

/// How many of their titles are movies and how many shows, each title once
/// however many ways they're credited on it, with their titles at TMDB that
/// aren't here.
public func personKindCounts(_ person: Person) -> BrowsedTitles.Kinds {
  var seen = Set<String>()
  var counts = BrowsedTitles.Kinds(movie: 0, show: 0)
  for credit in person.credits where seen.insert(credit.title.id).inserted {
    if credit.title.kind == TitleKind.movie { counts.movie += 1 } else if credit.title.kind == TitleKind.show {
      counts.show += 1
    }
  }
  for credit in person.catalog {
    if credit.ref.kind == TitleKind.movie { counts.movie += 1 } else if credit.ref.kind == TitleKind.show {
      counts.show += 1
    }
  }
  return counts
}

/// The kind the page shows: the one picked, while they have any of it, as
/// a kind with nothing would leave the page empty with no chip to undo it.
public func personShownKind(_ person: Person, picked: String?) -> String? {
  guard let picked else { return nil }
  let counts = personKindCounts(person)
  let count = picked == TitleKind.movie ? counts.movie : picked == TitleKind.show ? counts.show : 0
  return count > 0 ? picked : nil
}

/// A credit's line under its poster: the year and the part, each known, "1999 · Neo".
public func personCreditDetail(_ credit: PersonCredit) -> (year: Int?, role: String?) {
  (credit.title.year, credit.role.flatMap { $0.isEmpty ? nil : $0 })
}
