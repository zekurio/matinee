import Foundation
import Testing

@testable import MatineeCore

struct FormatTest {
  private let english = Locale(identifier: "en_US")
  private let german = Locale(identifier: "de_DE")

  @Test func clocks() {
    #expect(formatClock(245) == "4:05")
    #expect(formatClock(3755) == "1:02:35")
    #expect(formatClock(-3) == "0:00")
    #expect(formatClock(.nan) == "0:00")
  }

  @Test func sizesUseDecimalUnitsAndTheLanguagesSeparator() {
    #expect(formatBytes(512, locale: english) == "512 B")
    #expect(formatBytes(1_400_000_000, locale: english) == "1.4 GB")
    #expect(formatBytes(1_400_000_000, locale: german) == "1,4 GB")
    #expect(formatBytes(820_000_000, locale: german) == "820 MB")
  }

  @Test func bitRates() {
    #expect(bitrate(800_000, locale: english) == .kbps(800))
    #expect(bitrate(8_000_000, locale: english) == .mbps("8"))
    #expect(bitrate(2_500_000, locale: german) == .mbps("2,5"))
  }

  @Test func ratings() {
    #expect(formatRating(7.84, locale: english) == "7.8")
    #expect(formatRating(7.84, locale: german) == "7,8")
  }

  @Test func initialsOfNames() {
    #expect(initials("Masi Oka") == "MO")
    #expect(initials("zekurio") == "Z")
    #expect(initials("jean-luc picard") == "JP")
    #expect(initials("  ") == "?")
  }

  @Test func tonesMatchAndroids() {
    // Java's "Breaking Bad".hashCode() is -1215818520, and floorMod(…, 4) is 0;
    // "Toy Story" hashes to -313786509, which floor-mods to 3.
    #expect(toneIndex("Breaking Bad", count: 4) == 0)
    #expect(toneIndex("Toy Story", count: 4) == 3)
    #expect(toneIndex("", count: 4) == 0)
    #expect((0..<4).contains(toneIndex("The Matrix Alternate Extended Cut", count: 4)))
  }

  @Test func languagesNamedOnceInTheAppsLanguage() {
    #expect(languageList(["de", "en", "de-AT", nil], locale: english) == "German, English")
    #expect(languageList(["de", "en"], locale: german) == "Deutsch, Englisch")
    #expect(languageList([nil], locale: english) == nil)
  }

  @Test func days() throws {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = try #require(TimeZone(identifier: "Europe/Berlin"))
    let date = try #require(parseDay("2024-03-05", calendar: calendar))
    #expect(calendar.dateComponents([.year, .month, .day], from: date) == DateComponents(year: 2024, month: 3, day: 5))
    #expect(parseDay("soon") == nil)
    #expect(parseInstant("2024-03-05T10:00:00.123Z") != nil)
    #expect(parseInstant("2024-03-05T10:00:00Z") != nil)
  }

  @Test func watchedOnAPastDayIsItsNoon() throws {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = try #require(TimeZone(identifier: "Europe/Berlin"))
    let now = try #require(parseInstant("2024-06-10T08:00:00Z"))
    let picked = try #require(parseInstant("2024-06-01T21:30:00Z"))
    // 21:30 UTC is 23:30 in Berlin on June 1, whose noon is 10:00 UTC.
    #expect(watchedAtOn(picked, calendar: calendar, now: now) == "2024-06-01T10:00:00Z")
    // Today, before noon: now.
    #expect(watchedAtOn(now, calendar: calendar, now: now) == "2024-06-10T08:00:00Z")
  }

  @Test func blurHashesDecode() throws {
    let pixels = try #require(BlurHash.decode("LEHV6nWB2yk8pyo0adR*.7kCMdnj", width: 4, height: 3))
    #expect(pixels.count == 4 * 3 * 4)
    #expect(stride(from: 3, to: pixels.count, by: 4).allSatisfy { pixels[$0] == 255 })
    #expect(BlurHash.decode("nope") == nil)
    #expect(BlurHash.decode("LEHV6nWB2yk8pyo0adR*.7kCMdn") == nil)
  }
}
