#if os(tvOS)
  import MatineeKit
  import SwiftUI

  /*
   * Stand-ins for the server's pictures and titles, so the TV pages can be
   * judged with something like real content and no network: posters,
   * stills, and backdrops drawn from a few duotones and shapes, with the
   * names and facts a library would have.
   */

  /// A film or show the gallery shows.
  struct SampleTitle: Identifiable, Hashable {
    let id: String
    let name: String
    let year: Int
    let kind: Kind
    let genres: [String]
    let rating: Double
    let contentRating: String
    let runtime: Int
    let overview: String
    let tone: Int

    enum Kind { case movie, show }

    var facts: [String] {
      var facts = [String(year)]
      facts.append(kind == .movie ? "\(runtime / 60)h \(runtime % 60)m" : "\(runtime) episodes")
      facts.append(genres.prefix(2).joined(separator: ", "))
      return facts
    }
  }

  enum Samples {
    static let titles: [SampleTitle] = [
      SampleTitle(
        id: "harbour", name: "The Long Harbour", year: 2023, kind: .movie, genres: ["Drama", "Mystery"], rating: 7.8,
        contentRating: "12", runtime: 128,
        overview:
          "A lighthouse keeper's daughter returns to the island she left as a child and finds the harbour town keeping a secret about the night her father vanished.",
        tone: 0),
      SampleTitle(
        id: "neon", name: "Neon Tide", year: 2024, kind: .show, genres: ["Sci-Fi", "Thriller"], rating: 8.3,
        contentRating: "16", runtime: 18,
        overview:
          "In a flooded megacity, a salvage diver pulls a working memory core from the deep and becomes the most wanted person above the waterline.",
        tone: 1),
      SampleTitle(
        id: "orchard", name: "The Quiet Orchard", year: 2021, kind: .movie, genres: ["Drama"], rating: 7.1,
        contentRating: "6", runtime: 104,
        overview:
          "Three sisters gather for one last harvest before the family orchard is sold, and the summer brings back everything they never said.",
        tone: 2),
      SampleTitle(
        id: "kestrel", name: "Kestrel", year: 2022, kind: .movie, genres: ["Action", "Adventure"], rating: 6.9,
        contentRating: "16", runtime: 117,
        overview:
          "A grounded stunt pilot takes one last job flying contraband over the Alps, with a passenger who isn't who she says she is.",
        tone: 3),
      SampleTitle(
        id: "paper", name: "Paper Moons", year: 2020, kind: .show, genres: ["Comedy", "Romance"], rating: 7.6,
        contentRating: "12", runtime: 24,
        overview:
          "Two rival bookshop owners on the same street discover they have been writing to each other anonymously for a year.",
        tone: 4),
      SampleTitle(
        id: "north", name: "Northern Lights", year: 2019, kind: .movie, genres: ["Documentary"], rating: 8.0,
        contentRating: "0", runtime: 92,
        overview: "A winter in the far north with the scientists who chase the aurora across the Arctic sky.", tone: 5),
      SampleTitle(
        id: "glass", name: "Glass Houses", year: 2024, kind: .show, genres: ["Crime", "Drama"], rating: 8.6,
        contentRating: "16", runtime: 10,
        overview:
          "An architect is drawn into a murder investigation when a body is found inside the house she designed and swore was empty.",
        tone: 6),
      SampleTitle(
        id: "ember", name: "Ember & Ash", year: 2018, kind: .movie, genres: ["Fantasy"], rating: 6.4,
        contentRating: "12", runtime: 133,
        overview: "The last fire-keeper of a mountain kingdom must carry a single flame across a land that has forgotten warmth.",
        tone: 7),
      SampleTitle(
        id: "lowtide", name: "Low Tide", year: 2023, kind: .movie, genres: ["Horror"], rating: 6.1,
        contentRating: "18", runtime: 96,
        overview: "When the sea retreats further than it ever has, the villagers walk out onto the seabed and find a door.",
        tone: 1),
      SampleTitle(
        id: "diner", name: "Midnight Diner", year: 2017, kind: .show, genres: ["Drama", "Food"], rating: 8.1,
        contentRating: "12", runtime: 30,
        overview: "A diner that opens at midnight serves whatever its guests ask for, and listens to the stories they bring.",
        tone: 0),
      SampleTitle(
        id: "atlas", name: "Atlas of Clouds", year: 2022, kind: .movie, genres: ["Sci-Fi", "Drama"], rating: 7.4,
        contentRating: "12", runtime: 141,
        overview: "Six lives across five centuries are bound together by a single piece of music.", tone: 5),
      SampleTitle(
        id: "foxes", name: "Foxes in Winter", year: 2021, kind: .movie, genres: ["Animation", "Family"], rating: 7.9,
        contentRating: "0", runtime: 88,
        overview: "A young fox loses her family in the first snow and sets out across the valley to find them.", tone: 2),
    ]

    static func title(_ id: String) -> SampleTitle { titles.first { $0.id == id } ?? titles[0] }

    /// An episode to continue, with how far in it is.
    struct Episode: Identifiable, Hashable {
      let id: String
      let show: SampleTitle
      let code: String
      let name: String
      let progress: Double
      let left: String
    }

    static let continueWatching: [Episode] = [
      Episode(id: "neon-1-4", show: title("neon"), code: "S1 · E4", name: "Pressure", progress: 0.62, left: "18 min left"),
      Episode(id: "glass-2-1", show: title("glass"), code: "S2 · E1", name: "Foundations", progress: 0.21, left: "41 min left"),
      Episode(id: "harbour", show: title("harbour"), code: "", name: "The Long Harbour", progress: 0.47, left: "1h 8m left"),
      Episode(id: "paper-1-7", show: title("paper"), code: "S1 · E7", name: "Overdue", progress: 0.85, left: "4 min left"),
      Episode(id: "diner-3-2", show: title("diner"), code: "S3 · E2", name: "Tamagoyaki", progress: 0.33, left: "20 min left"),
      Episode(id: "kestrel", show: title("kestrel"), code: "", name: "Kestrel", progress: 0.12, left: "1h 43m left"),
    ]

    static let people: [(name: String, role: String)] = [
      ("Ingrid Halvorsen", "Mara"), ("Tomás Ferreira", "Elias"), ("Aiko Tanabe", "Dr. Sato"),
      ("Samuel Okafor", "Harbourmaster"), ("Lena Brandt", "Young Mara"), ("Rafael Moreau", "Director"),
      ("Priya Raman", "Writer"),
    ]
  }

  /// The duotones the stand-in art is drawn from.
  private let tones: [(Color, Color, Color)] = [
    (Color(red: 0.06, green: 0.16, blue: 0.27), Color(red: 0.93, green: 0.55, blue: 0.29), Color(red: 0.99, green: 0.86, blue: 0.62)),
    (Color(red: 0.09, green: 0.04, blue: 0.2), Color(red: 0.85, green: 0.19, blue: 0.56), Color(red: 0.36, green: 0.86, blue: 0.94)),
    (Color(red: 0.13, green: 0.2, blue: 0.11), Color(red: 0.62, green: 0.74, blue: 0.4), Color(red: 0.98, green: 0.93, blue: 0.75)),
    (Color(red: 0.2, green: 0.24, blue: 0.3), Color(red: 0.55, green: 0.67, blue: 0.82), Color(red: 0.97, green: 0.97, blue: 0.95)),
    (Color(red: 0.36, green: 0.1, blue: 0.14), Color(red: 0.96, green: 0.6, blue: 0.58), Color(red: 1, green: 0.93, blue: 0.87)),
    (Color(red: 0.02, green: 0.07, blue: 0.13), Color(red: 0.16, green: 0.72, blue: 0.55), Color(red: 0.71, green: 0.98, blue: 0.83)),
    (Color(red: 0.08, green: 0.08, blue: 0.09), Color(red: 0.43, green: 0.47, blue: 0.53), Color(red: 0.9, green: 0.8, blue: 0.55)),
    (Color(red: 0.16, green: 0.05, blue: 0.02), Color(red: 0.86, green: 0.31, blue: 0.08), Color(red: 1, green: 0.78, blue: 0.35)),
  ]

  /// A poster for `title`: a scene in its tones and its name set as a poster sets it.
  struct PosterArt: View {
    let title: SampleTitle
    var showsName = true

    var body: some View {
      let (deep, mid, light) = tones[title.tone % tones.count]
      GeometryReader { proxy in
        let size = proxy.size
        ZStack {
          LinearGradient(colors: [deep, mid], startPoint: .top, endPoint: .bottom)
          Circle().fill(light.opacity(0.9))
            .frame(width: size.width * 0.55)
            .position(x: size.width * (0.3 + Double(title.name.count % 4) * 0.12), y: size.height * 0.36)
            .blur(radius: 1)
          Ridge(seed: title.name.count, height: 0.42).fill(deep.opacity(0.85))
          Ridge(seed: title.name.count + 3, height: 0.3).fill(deep)
          if showsName {
            VStack(spacing: size.width * 0.02) {
              Spacer()
              Text(title.name.uppercased())
                .font(RedHatText.font(fixedSize: size.width * 0.11, weight: .bold))
                .tracking(size.width * 0.012)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.5)
                .foregroundStyle(light)
              Text(String(title.year))
                .font(RedHatText.font(fixedSize: size.width * 0.05, weight: .medium))
                .tracking(size.width * 0.02)
                .foregroundStyle(light.opacity(0.7))
            }
            .padding(size.width * 0.08)
          }
        }
      }
    }
  }

  /// A still or a backdrop for `title`: the same scene, wide.
  struct WideArt: View {
    let title: SampleTitle
    var variant = 0

    var body: some View {
      let (deep, mid, light) = tones[(title.tone + variant) % tones.count]
      GeometryReader { proxy in
        let size = proxy.size
        ZStack {
          LinearGradient(colors: [mid.opacity(0.8), light.opacity(0.55), deep], startPoint: .top, endPoint: .bottom)
          Circle().fill(light)
            .frame(width: size.height * 0.5)
            .position(x: size.width * (0.55 + Double(title.name.count % 3) * 0.1), y: size.height * 0.42)
            .blur(radius: size.height * 0.01)
          Ridge(seed: title.name.count + variant, height: 0.5).fill(deep.opacity(0.7))
          Ridge(seed: title.name.count + variant + 5, height: 0.34).fill(deep)
        }
      }
    }
  }

  /// A line of hills along the bottom, `height` of the frame at most.
  private nonisolated struct Ridge: Shape {
    let seed: Int
    let height: Double

    func path(in rect: CGRect) -> Path {
      var path = Path()
      let steps = 7
      path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
      for step in 0...steps {
        let x = rect.minX + rect.width * Double(step) / Double(steps)
        let wave = sin(Double(step * 3 + seed) * 1.3) * 0.5 + 0.5
        let y = rect.maxY - rect.height * height * (0.45 + 0.55 * wave)
        path.addLine(to: CGPoint(x: x, y: y))
      }
      path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
      path.closeSubpath()
      return path
    }
  }

  /// A see-through logo for `title`, as a title's logo would be: its name,
  /// set large in its light tone, with no box behind.
  struct LogoArt: View {
    let title: SampleTitle

    var body: some View {
      let (_, _, light) = tones[title.tone % tones.count]
      Text(title.name.uppercased())
        .font(RedHatText.font(fixedSize: 64, weight: .bold))
        .tracking(10)
        .lineLimit(1)
        .minimumScaleFactor(0.4)
        .foregroundStyle(light)
        .shadow(color: .black.opacity(0.4), radius: 8, y: 2)
    }
  }
#endif
