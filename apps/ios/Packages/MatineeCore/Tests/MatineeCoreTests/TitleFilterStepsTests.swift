import Foundation
import Testing

@testable import MatineeCore

/// TitleFilterSteps.swift: the filters as Left and Right step them on a TV.
struct TitleFilterStepsTests {
  private let years = FilterRange(min: 1950, max: 2024, step: 1)
  private let scores = FilterRange(min: 0, max: 10, step: 0.5)

  @Test func anOpenEndStartsOneStepInFromTheSpansEnd() {
    #expect(stepRange(years, low: nil, high: nil, end: .low, by: 1) == (1951, nil))
    #expect(stepRange(years, low: nil, high: nil, end: .high, by: -1) == (nil, 2023))
  }

  @Test func steppingBackToTheSpansEndOpensIt() {
    #expect(stepRange(years, low: 1951, high: nil, end: .low, by: -1) == (nil, nil))
    #expect(stepRange(years, low: nil, high: 2023, end: .high, by: 1) == (nil, nil))
    // Past it too: an open end stays open.
    #expect(stepRange(years, low: nil, high: nil, end: .low, by: -5) == (nil, nil))
    #expect(stepRange(years, low: nil, high: nil, end: .high, by: 3) == (nil, nil))
  }

  @Test func neitherEndPassesTheOther() {
    #expect(stepRange(years, low: 1990, high: 1991, end: .low, by: 3) == (1991, 1991))
    #expect(stepRange(years, low: 1990, high: 1991, end: .high, by: -3) == (1990, 1990))
    // With the high end open, the low one stops at the span's end and stays a limit.
    #expect(stepRange(years, low: 2023, high: nil, end: .low, by: 4) == (2024, nil))
  }

  @Test func valuesLandOnTheSpansSteps() {
    let stepped = stepRange(scores, low: 7.2, high: nil, end: .low, by: 1)
    #expect(stepped.low == 7.5)
    let tenths = FilterRange(min: 0, max: 10, step: 0.1)
    #expect(stepRange(tenths, low: 7.2, high: nil, end: .low, by: 1).low == 7.3)
    // A span whose end isn't on a step: Left from open lands on the step under it.
    let runtime = FilterRange(min: 0, max: 237, step: 10)
    #expect(stepRange(runtime, low: nil, high: nil, end: .high, by: -1) == (nil, 230))
  }

  @Test func aSpanWithNothingToStepLeavesTheRangeAsItWas() {
    let flat = FilterRange(min: 2000, max: 2000, step: 1)
    #expect(stepRange(flat, low: nil, high: nil, end: .low, by: 1) == (nil, nil))
    let still = FilterRange(min: 0, max: 10, step: 0)
    #expect(stepRange(still, low: 3, high: nil, end: .low, by: 1) == (3, nil))
  }

  @Test func choicesStepFromAnyAndStopAtEitherEnd() {
    let choices = WATCH_FILTER_STEPS
    #expect(stepChoice(choices, current: nil, by: 1) == WatchFilter.unwatched)
    #expect(stepChoice(choices, current: WatchFilter.unwatched, by: -1) == nil)
    #expect(stepChoice(choices, current: WatchFilter.watched, by: 1) == WatchFilter.watched)
    #expect(stepChoice(choices, current: nil, by: -1) == nil)
    #expect(stepChoice(choices, current: "gone", by: 1) == WatchFilter.unwatched)
    #expect(stepChoice([String](), current: nil, by: 1) == nil)
  }

  @Test func anAgeLimitStepsThroughItsCountrysRatings() {
    let system = RatingSystem(
      kind: TitleKind.movie, country: "DE",
      ratings: ["0", "6", "12"].map { RatingCount(rating: $0, titleCount: 1) })
    #expect(stepAgeLimit(system, current: nil, by: 1) == AgeLimit(country: "DE", rating: "0"))
    #expect(stepAgeLimit(system, current: AgeLimit(country: "DE", rating: "6"), by: 1) == AgeLimit(country: "DE", rating: "12"))
    #expect(stepAgeLimit(system, current: AgeLimit(country: "DE", rating: "0"), by: -1) == nil)
    // Another country's limit is none here.
    #expect(stepAgeLimit(system, current: AgeLimit(country: "US", rating: "PG"), by: 1) == AgeLimit(country: "DE", rating: "0"))
  }
}
