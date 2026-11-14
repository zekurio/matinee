import Foundation
import Testing

@testable import MatineeCore

struct MetadataTests {
  private func title(provider: String? = nil, providerId: String? = nil) -> Title {
    Title(
      id: "t", libraryId: "l", kind: TitleKind.movie, name: "The Matrix", year: 1999, overview: nil,
      images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil,
      contentRating: nil, originalLanguage: nil, favorite: false, watched: false,
      originalName: nil, tagline: nil, releaseDate: nil, status: nil, runtimeMinutes: nil,
      path: "The Matrix (1999)", provider: provider, providerId: providerId, externalIds: [:],
      refreshedAt: nil, studios: [], credits: [], trailers: [], itemCount: 1, seasons: [], next: nil)
  }

  private func match(_ id: String, provider: String = "tmdb") -> MetadataMatch {
    MetadataMatch(provider: provider, id: id, name: "The Matrix", year: 1999, overview: nil, poster: nil)
  }

  private let art = Artwork(id: "a", placeholder: nil)

  private func provider(configured: Bool) -> MetadataProvider {
    MetadataProvider(id: "tmdb", name: "TMDB", description: "", episodes: true, configured: configured, setup: nil)
  }

  @Test func searchFallsBackOnTheTitlesNameAndTakesANumericYear() {
    #expect(IdentifyQuery(typed: "  Matrix ", year: "1999", fallback: "The Matrix") == IdentifyQuery(name: "Matrix", year: 1999))
    #expect(IdentifyQuery(typed: "   ", year: "", fallback: "The Matrix") == IdentifyQuery(name: "The Matrix", year: nil))
    #expect(IdentifyQuery(typed: "x", year: "19x", fallback: "y").year == nil)
  }

  @Test func yearKeepsFourDigits() {
    #expect(yearDigits("19a99 7") == "1999")
    #expect(yearDigits("٢٠٢٠") == "")
    #expect(yearDigits("") == "")
  }

  @Test func currentMatchNeedsTheIdAndAgreeingProvider() {
    #expect(isCurrentMatch(match("603"), of: title(provider: "tmdb", providerId: "603")))
    #expect(isCurrentMatch(match("603"), of: title(providerId: "603")))
    #expect(!isCurrentMatch(match("603", provider: "tvdb"), of: title(provider: "tmdb", providerId: "603")))
    #expect(!isCurrentMatch(match("604"), of: title(provider: "tmdb", providerId: "603")))
    #expect(!isCurrentMatch(match("603"), of: title()))
  }

  @Test func onlyAProviderWithItsKeyAndAMatchListsImages() {
    #expect(usableProvider(provider(configured: false)) == nil)
    #expect(usableProvider(nil) == nil)
    #expect(listsImages(provider: provider(configured: true), title: title(providerId: "603")))
    #expect(!listsImages(provider: provider(configured: true), title: title()))
    #expect(!listsImages(provider: provider(configured: false), title: title(providerId: "603")))
  }

  @Test func stateSaysWhereTheImageCameFrom() {
    let state = { (slot: String, image: Artwork?, chosen: Bool, uploaded: Bool, provider: String?) in
      ImageState(slot: slot, current: ItemImage(slot: slot, image: image, chosen: chosen, uploaded: uploaded), providerName: provider)
    }
    #expect(state(ImageSlot.poster, nil, true, false, "TMDB") == .removed)
    #expect(state(ImageSlot.still, nil, true, false, "TMDB") == .removed)
    #expect(state(ImageSlot.still, nil, false, false, "TMDB") == .noneFrame)
    #expect(state(ImageSlot.poster, nil, false, false, nil) == .none)
    #expect(state(ImageSlot.poster, art, true, true, "TMDB") == .uploaded)
    #expect(state(ImageSlot.poster, art, true, false, nil) == .picked)
    #expect(state(ImageSlot.poster, art, true, false, "TMDB") == .pickedFrom("TMDB"))
    #expect(state(ImageSlot.poster, art, false, false, "TMDB") == .from("TMDB"))
  }

  @Test func buttonsFollowTheImageInUse() {
    #expect(ImageButtons(inUse: nil, lists: true) == ImageButtons(inUse: ItemImage(slot: "poster", image: nil, chosen: false, uploaded: false), lists: false))
    let uploaded = ItemImage(slot: "poster", image: art, chosen: true, uploaded: true)
    #expect(ImageButtons(inUse: uploaded, lists: false).remove)
    #expect(!ImageButtons(inUse: uploaded, lists: false).reset)
    #expect(ImageButtons(inUse: uploaded, lists: true).reset)
    let removed = ItemImage(slot: "poster", image: nil, chosen: true, uploaded: false)
    #expect(!ImageButtons(inUse: removed, lists: true).remove)
    #expect(ImageButtons(inUse: removed, lists: true).reset)
  }

  @Test func columnsAreAndroidsOnAPhoneAndGrowWithTheWidth() {
    #expect(imageColumns(ImageSlot.poster, width: 390) == 3)
    #expect(imageColumns(ImageSlot.backdrop, width: 390) == 2)
    #expect(imageColumns(ImageSlot.poster, width: 1000) == 6)
    #expect(imageColumns(ImageSlot.still, width: 1000) == 3)
    #expect(imageColumns(ImageSlot.logo, width: 600) == 2)
    #expect(imageColumns(ImageSlot.poster, width: 390, largeText: true) == 2)
    #expect(imageColumns(ImageSlot.still, width: 390, largeText: true) == 1)
  }

  @Test func captionLeavesTheLanguageOffStills() {
    let image = RemoteImage(id: "r", preview: art, width: 1000, height: 1500, language: "en")
    #expect(ImageCaption(image, slot: ImageSlot.poster).size == .init(width: 1000, height: 1500))
    #expect(ImageCaption(image, slot: ImageSlot.poster).language == .code("en"))
    #expect(ImageCaption(image, slot: ImageSlot.still).language == nil)
    let bare = RemoteImage(id: "r", preview: art, width: 1000, height: nil, language: nil)
    #expect(ImageCaption(bare, slot: ImageSlot.logo).size == nil)
    #expect(ImageCaption(bare, slot: ImageSlot.logo).language == .noText)
  }

  @Test func languageIsNamedInTheAppsLanguage() {
    #expect(languageName("en", locale: Locale(identifier: "en")) == "English")
    #expect(languageName("en", locale: Locale(identifier: "de")) == "Englisch")
    #expect(languageName("fr", locale: Locale(identifier: "fr")) == "Français")
  }

  @Test func uploadTakesJpegPngAndWebpUnderTheLimit() throws {
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0, 0, 0])
    let part = try checkUpload(jpeg).get()
    #expect(part.type == "image/jpeg")
    #expect(part.name == "image.jpeg")
    #expect(try checkUpload(Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0])).get().name == "image.png")
    #expect(try checkUpload(Data("RIFF\0\0\0\0WEBPVP8 ".utf8)).get().type == "image/webp")
    #expect(throws: UploadProblem.wrongType) { try checkUpload(Data("GIF89a".utf8)).get() }
    #expect(throws: UploadProblem.wrongType) { try checkUpload(Data("RIFF\0\0\0\0WAVE".utf8)).get() }
    #expect(throws: UploadProblem.unreadable) { try checkUpload(Data()).get() }
    #expect(throws: UploadProblem.unreadable) { try checkUpload(nil).get() }
    var big = jpeg
    big.append(Data(count: Int(MAX_IMAGE_BYTES)))
    #expect(throws: UploadProblem.tooBig) { try checkUpload(big).get() }
  }
}
