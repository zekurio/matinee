import type { Artwork } from "@matinee/contracts"
import { artworkPath } from "@matinee/contracts/paths"
import type { ComponentChildren } from "preact"
import { useEffect, useState } from "preact/hooks"

import { usePicture } from "@/api/images"
import { type ImageSource, initials } from "@/model/format"

import { cx, Tap, type TapProps } from "./base"

/*
 * The gradients that stand in for missing art: the surfaces, a step
 * apart, picked by the item's name so the same one always gets the same.
 */
const TONES = [
  ["#2c2c2f", "#202022"],
  ["#303033", "#212124"],
  ["#353538", "#232326"],
  ["#333336", "#222225"],
] as const

function toneOf(key: string): string {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0
  }
  const [from, to] = TONES[Math.abs(hash) % TONES.length] ?? TONES[0]
  return `linear-gradient(135deg, ${from}, ${to})`
}

/**
 * The first of `sources` that loads, filling what it's in. Nothing while
 * none has, so what's under it shows: a card's tone and name.
 */
export function Picture(props: {
  sources: readonly ImageSource[]
  class?: string
}) {
  const key = props.sources.join(" ")
  // How many of the sources failed, for these sources.
  const [failed, setFailed] = useState({ key, count: 0 })
  const skipped = failed.key === key ? failed.count : 0
  const source = props.sources[skipped]
  const picture = usePicture(source)
  const next = () => setFailed({ key, count: skipped + 1 })
  const gone = picture.failed && source !== undefined
  useEffect(() => {
    // This one didn't load: on to the next.
    if (gone) setFailed({ key, count: skipped + 1 })
  }, [gone, key, skipped])
  if (gone || !picture.src) return null
  return (
    <img
      class={cx("photo", props.class)}
      src={picture.src}
      alt=""
      onError={next}
    />
  )
}

type CardFocus = Pick<TapProps, "fid" | "onFocus" | "onMenu" | "tapRef">

/**
 * A card's picture as the focus target: `children` over the item's tone,
 * with the TV focus look. Put the card's caption, if any, outside it, so
 * only the picture grows.
 */
export function ArtCard(
  props: CardFocus & {
    toneKey: string
    aspect: "poster" | "landscape" | "square"
    onPress: () => void
    label?: string
    round?: boolean
    children?: ComponentChildren
  },
) {
  return (
    <Tap
      {...props}
      class={cx("pic", props.round && "round")}
      label={props.label}
    >
      <div
        class={cx("pic-clip", props.aspect)}
        style={{ background: toneOf(props.toneKey) }}
      >
        <div class="fill">{props.children}</div>
      </div>
    </Tap>
  )
}

/** The accent's dot on something watched. */
export function WatchedMark() {
  return <i class="watched-mark" />
}

/** How far into a file the person is: the accent on a dark track. */
export function Progress(props: { ratio: number }) {
  const width = `${Math.max(0, Math.min(1, props.ratio)) * 100}%`
  return (
    <div class="progress">
      <i style={{ width }} />
    </div>
  )
}

/** A movie or show as its 2:3 poster, its name on the tone until the picture loads. */
export function PosterCard(
  props: CardFocus & {
    name: string
    poster: ImageSource | null
    onPress: () => void
    watched?: boolean
    class?: string
    children?: ComponentChildren
  },
) {
  return (
    <div class={cx("card-poster", props.class)}>
      <ArtCard
        {...props}
        toneKey={props.name}
        aspect="poster"
        label={props.name}
      >
        <span class="pic-name t-label lines">{props.name}</span>
        {props.poster && <Picture sources={[props.poster]} />}
        {props.watched && <WatchedMark />}
        {props.children}
      </ArtCard>
    </div>
  )
}

/**
 * A `PosterCard` with a caption under it, as in a grid or a row of
 * seasons: `name` and a dimmer `detail`. `badge` counts what's left in it.
 */
export function CaptionedPoster(
  props: CardFocus & {
    name: string
    poster: ImageSource | null
    detail: string | null
    onPress: () => void
    watched?: boolean
    badge?: string
    class?: string
  },
) {
  return (
    <div class={cx("card-poster", props.class)}>
      <ArtCard
        {...props}
        toneKey={props.name}
        aspect="poster"
        label={props.name}
      >
        <span class="pic-name t-label lines">{props.name}</span>
        {props.poster && <Picture sources={[props.poster]} />}
        {props.watched && <WatchedMark />}
        {props.badge && !props.watched && (
          <span class="badge t-caption">{props.badge}</span>
        )}
      </ArtCard>
      <div class="card-caption t-label one-line">{props.name}</div>
      {props.detail && (
        <div class="t-caption muted one-line">{props.detail}</div>
      )}
    </div>
  )
}

/**
 * A file as a 16:9 still, for Continue watching and Next up, with how far
 * in the person is along its bottom and a caption under it.
 */
export function LandscapeCard(
  props: CardFocus & {
    toneKey: string
    art: readonly ImageSource[]
    caption: string
    detail: string | null
    onPress: () => void
    progress?: number | null
    watched?: boolean
  },
) {
  return (
    <div class="card-landscape">
      <ArtCard {...props} aspect="landscape" label={props.caption}>
        <Picture sources={props.art} />
        {props.watched ? (
          <WatchedMark />
        ) : (
          props.progress !== null &&
          props.progress !== undefined &&
          props.progress > 0 && <Progress ratio={props.progress} />
        )}
      </ArtCard>
      <div class="card-caption t-label one-line">{props.caption}</div>
      {props.detail && (
        <div class="t-caption muted one-line">{props.detail}</div>
      )}
    </div>
  )
}

/**
 * A person as a round photo, their initials until it loads, with their
 * name and role under it.
 */
export function PersonCard(
  props: CardFocus & {
    name: string
    /** Their part, or their job. */
    detail: string | null
    photo: ImageSource | null
    onPress: () => void
  },
) {
  return (
    <div class="card-person">
      <ArtCard
        {...props}
        toneKey={props.name}
        aspect="square"
        round
        label={props.name}
      >
        <span class="t-headline muted">{initials(props.name)}</span>
        {props.photo && <Picture sources={[props.photo]} />}
      </ArtCard>
      <div class="card-caption t-label one-line">{props.name}</div>
      {props.detail && (
        <div class="t-caption muted one-line">{props.detail}</div>
      )}
    </div>
  )
}

/**
 * A titled row of cards that scrolls sideways. Cards pass out of sight at
 * the drawer's rail on the left and at the screen's edge on the right,
 * and the focused card always stays clear of both, with room for its
 * ring. `name` names it in the page's focus memory, so it lands on the
 * card it left when focus comes back.
 */
export function Row(props: {
  title: string | null
  name: string
  buttons?: boolean
  class?: string
  children: ComponentChildren
}) {
  return (
    <div class={props.class}>
      {props.title !== null && (
        <div class="row-title t-title one-line">{props.title}</div>
      )}
      <div
        class={cx("row-cards", props.buttons && "buttons")}
        data-fg={props.name}
        data-fk="row"
        data-scroll="row"
        data-scroll-start="20"
        data-scroll-end="52"
      >
        {props.children}
      </div>
    </div>
  )
}

/** A person's picture, or the first letter of their name on a tone. */
export function Avatar(props: {
  name: string
  /** `avatarUrl` from the contract. */
  url: string | null
  size: number
}) {
  const size = `${props.size}rem`
  return (
    <span
      class="avatar center"
      style={{ width: size, height: size, fontSize: `${props.size * 0.4}rem` }}
    >
      {initials(props.name).charAt(0)}
      {props.url && <Picture sources={[props.url]} />}
    </span>
  )
}

/** A title as its logo, fit into a box, or as `children` when it has none or the logo won't load. */
export function TitleLogo(props: {
  name: string
  logo: Artwork | null | undefined
  width: number
  height: number
  bottom?: boolean
  children: ComponentChildren
}) {
  const picture = usePicture(
    props.logo ? artworkPath(props.logo.id, "medium") : null,
  )
  const [broken, setBroken] = useState<string | null>(null)
  if (!props.logo || picture.failed || broken === props.logo.id) {
    return props.children
  }
  const id = props.logo.id
  return (
    <div
      style={{
        width: `${props.width}rem`,
        height: `${props.height}rem`,
        display: "flex",
        alignItems: props.bottom ? "flex-end" : "center",
      }}
    >
      {picture.src && (
        <img
          src={picture.src}
          alt={props.name}
          style={{ maxWidth: "100%", maxHeight: "100%" }}
          onError={() => setBroken(id)}
        />
      )}
    </div>
  )
}
