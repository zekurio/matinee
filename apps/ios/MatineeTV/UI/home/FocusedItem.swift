import MatineeCore
import MatineeKit
import SwiftUI

/*
 * FocusedItem.kt: what Home's header says about the focused card, and the
 * backdrop behind it, with the facts the phone's Home shows for the same
 * item, in the kit's `TVItemInfo`.
 */

/// The focused card, for Home's header and backdrop.
struct FocusedItem: Hashable {
  /// Tells cards apart: the same title in two rows is one item for the backdrop.
  let key: String
  let info: TVItemInfo
  /// The title's logo, a show's for an episode, shown in place of the name.
  let logo: ImageSource?
  /// The art behind it, best first.
  let backdrop: [ImageSource]
}

/// The art behind a file, best first, as the phone's banner has it.
private func backdropOf(_ api: MatineeApi?, _ item: MediaItem, _ backdrop: Artwork?) -> [ImageSource] {
  guard let api else { return [] }
  return [api.art(backdrop, size: .large), api.art(item.episode?.still, size: .large), api.frame(item.id, large: true)]
    .compactMap(\.self)
}

private func rating(_ value: Double?) -> String? { value.map(formatRating) }

/// A featured title, the phone's banner slide.
func featuredInfo(_ slide: FeaturedTitle, api: MatineeApi?) -> FocusedItem {
  let title = slide.title
  return FocusedItem(
    key: "title/\(title.id)",
    info: TVItemInfo(
      name: title.name,
      facts: [
        formatYear(title.year), title.isShow && slide.count > 1 ? Str.mediaEpisodeCount(slide.count) : nil,
        timeLeft(slide.item),
      ].compactMap(\.self),
      contentRating: title.contentRating, rating: rating(title.rating), overview: title.overview),
    logo: api?.art(title.images.logo, size: .medium),
    backdrop: (HomeDevData.backdrop(slide) ?? []) + backdropOf(api, slide.item, title.images.backdrop))
}

/// A file in Continue watching or Next up.
func itemInfo(_ item: MediaItem, api: MatineeApi?) -> FocusedItem {
  let label = itemLabel(item)
  let code = episodeCode(item)
  let left = item.progress?.completed == false ? timeLeft(item) : nil
  return FocusedItem(
    key: item.title.map { "title/\($0.id)" } ?? "item/\(item.id)",
    info: TVItemInfo(
      name: label.showName,
      subtitle: code.map { Str.mediaCodeTitle($0, label.title) },
      facts: [label.year, formatRuntime(runtimeMinutes(item)), left].compactMap(\.self),
      contentRating: item.title?.contentRating, rating: rating(item.title?.rating),
      overview: item.episode?.overview ?? item.title?.overview),
    logo: api?.art(item.title?.images.logo, size: .medium),
    backdrop: backdropOf(api, item, item.title?.images.backdrop))
}

/// A title on a library's shelf, with what its card says.
func shelfInfo(_ entry: ShelfEntry, detail: String?, api: MatineeApi?) -> FocusedItem {
  let title = entry.title
  let movie = title.kind == TitleKind.movie
  return FocusedItem(
    key: "title/\(title.id)",
    info: TVItemInfo(
      name: title.name,
      subtitle: movie ? nil : detail,
      facts: [formatYear(title.year), movie ? formatRuntime(runtimeMinutes(entry.item)) : nil].compactMap(\.self),
      contentRating: title.contentRating, rating: rating(title.rating), overview: title.overview),
    logo: api?.art(title.images.logo, size: .medium),
    backdrop: [api?.art(title.images.backdrop, size: .large), api?.frame(entry.item.id, large: true)].compactMap {
      $0 ?? nil
    })
}

/// A movie or show by itself, as a recommendation row shows it.
func titleInfo(_ title: TitleSummary, api: MatineeApi?) -> FocusedItem {
  FocusedItem(
    key: "title/\(title.id)",
    info: TVItemInfo(
      name: title.name,
      facts: [formatYear(title.year), title.kind == TitleKind.movie ? formatRuntime(title.runtimeMinutes) : nil]
        .compactMap(\.self),
      contentRating: title.contentRating, rating: rating(title.rating), overview: title.overview),
    logo: api?.art(title.images.logo, size: .medium),
    backdrop: [api?.art(title.images.backdrop, size: .large)].compactMap { $0 ?? nil })
}
