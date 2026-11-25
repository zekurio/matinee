import type { Favorite } from "@matinee/contracts"
import { Match, Show, Switch } from "solid-js"

import { PosterCard } from "@/components/media-item"
import { tr } from "@/i18n"
import { art, episodeCode, itemLabel, seasonName } from "@/lib/media"

/** Tells favorites apart in a row that mixes their kinds. */
export function favoriteKey(favorite: Favorite): string {
  switch (favorite.kind) {
    case "movie":
    case "show":
      return `title/${favorite.title.id}`
    case "showSeason":
      return `season/${favorite.title.id}/${favorite.season.number}`
    case "episode":
      return `episode/${favorite.item.id}`
  }
}

/**
 * A favorite of any kind as a poster, so a row that mixes them lines up:
 * a movie, a show, a season on its own poster, or an episode on its show's.
 */
export function FavoriteCard(props: { favorite: Favorite }) {
  return (
    <Switch>
      <Match
        when={
          (props.favorite.kind === "movie" || props.favorite.kind === "show") &&
          props.favorite
        }
      >
        {(favorite) => <PosterCard title={favorite().title} />}
      </Match>
      <Match when={props.favorite.kind === "showSeason" && props.favorite}>
        {(favorite) => (
          <SeasonFavorite title={favorite().title} season={favorite().season} />
        )}
      </Match>
      <Match when={props.favorite.kind === "episode" && props.favorite}>
        {(favorite) => <EpisodeFavorite item={favorite().item} />}
      </Match>
    </Switch>
  )
}

type SeasonFavoriteProps = Extract<Favorite, { kind: "showSeason" }>
type EpisodeFavoriteProps = Extract<Favorite, { kind: "episode" }>

/** The season's poster, or the show's, with the show's name over the season's. */
function SeasonFavorite(props: Omit<SeasonFavoriteProps, "kind">) {
  return (
    <PosterCard
      title={props.title}
      detail={seasonName(props.season.number)}
      label={tr("title.seasonOf", {
        show: props.title.name,
        season: seasonName(props.season.number),
      })}
      poster={art(props.season.poster ?? props.title.images.poster)}
      to={{ kind: "season", season: props.season }}
    />
  )
}

/**
 * The show's poster with the show's name over the episode's; Play starts
 * the episode. An episode the server files under no title has no poster
 * to stand on and shows nothing.
 */
function EpisodeFavorite(props: Omit<EpisodeFavoriteProps, "kind">) {
  const label = () => itemLabel(props.item)
  const code = () => episodeCode(props.item)
  const episode = () => {
    const found = code()
    return found
      ? tr("media.codeTitle", { code: found, title: label().title })
      : label().title
  }
  const name = () => {
    const found = code()
    return found
      ? tr("media.showCodeTitle", {
          show: label().showName,
          code: found,
          title: label().title,
        })
      : label().title
  }
  return (
    <Show when={props.item.title}>
      {(title) => (
        <PosterCard
          title={title()}
          detail={episode()}
          label={name()}
          to={{ kind: "episode", item: props.item }}
          play={props.item}
        />
      )}
    </Show>
  )
}
