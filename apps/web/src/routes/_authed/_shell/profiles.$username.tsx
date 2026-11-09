import { type Profile, StatsRange } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import { FeedbackButton } from "@matinee/ui/components/feedback-button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  CalendarDaysIcon,
  HeartIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  PopcornIcon,
  Share2Icon,
  ShieldIcon,
} from "lucide-react"

import { EpisodeCard, PosterCard } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { Rail, RailItem } from "@/components/rail"
import { RangePicker } from "@/components/stats/range-picker"
import { ActivitySection, StandingSection } from "@/components/stats/standing"
import {
  PrivateNote,
  SectionHeading,
  statsGrid,
  StatsEmpty,
} from "@/components/stats/stat-blocks"
import {
  GenresSection,
  hasPlays,
  TopTitlesSection,
  watchFigures,
  WatchStatsSkeleton,
  WatchOverview,
} from "@/components/stats/watch-stats"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { formatMonth } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import { browserTimeZone, rangePhrase } from "@/lib/stats"
import { useActionFeedback } from "@/lib/use-action-feedback"

/** All time is the default, so the URL leaves it out. */
const ProfileSearch = t.object({
  range: StatsRange.exclude(["all"]).optional().catch(undefined),
})

export const Route = createFileRoute("/_authed/_shell/profiles/$username")({
  validateSearch: ProfileSearch,
  component: ProfilePage,
})

const TIME_ZONE = browserTimeZone()

function displayName(profile: Profile): string {
  return profile.user.displayName ?? profile.user.username
}

function ProfilePage() {
  const { username } = Route.useParams()
  const profile = useQuery(
    orpc.profiles.get.queryOptions({ input: { username } }),
  )
  useDocumentTitle(profile.data ? displayName(profile.data) : null)

  if (profile.isPending) return <ProfileSkeleton />
  if (!profile.data) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {tr("profile.loadFailed")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {errorMessage(profile.error)}
        </p>
        <Link
          to="/"
          className={buttonVariants({
            variant: "secondary",
            className: "mt-6",
          })}
        >
          {tr("profile.backHome")}
        </Link>
      </div>
    )
  }
  const data = profile.data
  const shared = data.self || data.sharing.favorites || data.sharing.stats
  return (
    <div className="flex flex-col gap-10">
      <ProfileHeader profile={data} />
      {!shared ? (
        <StatsEmpty
          icon={LockIcon}
          title={tr("profile.private", { name: displayName(data) })}
        />
      ) : (
        <>
          <Favorites profile={data} />
          {(data.self || data.sharing.stats) && <Statistics profile={data} />}
          {data.recent && data.recent.length > 0 && (
            <Rail title={tr("profile.recent")}>
              {data.recent.map((entry) => (
                <RailItem key={entry.item.id}>
                  <EpisodeCard item={entry.item} />
                </RailItem>
              ))}
            </Rail>
          )}
        </>
      )}
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center gap-5">
        <Skeleton className="size-16 shrink-0 rounded-full sm:size-20" />
        <div className="flex-1">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="mt-3 h-4 w-40" />
        </div>
      </div>
      <WatchStatsSkeleton />
    </div>
  )
}

/** The picture, the name, and a way to share the page or change it. */
function ProfileHeader({ profile }: { profile: Profile }) {
  const { user } = profile
  const openSettings = useOpenSettings()
  return (
    <header>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <UserAvatar
          user={user}
          className="size-16 text-2xl shadow-lg shadow-black/40 sm:size-20 sm:text-3xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] leading-8 font-semibold tracking-tight md:text-[32px] md:leading-10">
            {displayName(profile)}
          </h1>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {user.displayName && <span>@{user.username}</span>}
            {user.role === "admin" && (
              <span className="inline-flex items-center gap-1">
                <ShieldIcon aria-hidden className="size-3.5" />
                {tr("profile.admin")}
              </span>
            )}
            <span>
              {tr("profile.joined", { date: formatMonth(user.createdAt) })}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profile.self && (
            <Button variant="secondary" onClick={() => openSettings("account")}>
              <PencilIcon />
              {tr("profile.edit")}
            </Button>
          )}
          <ShareButton profile={profile} />
        </div>
      </div>
    </header>
  )
}

/**
 * Hands the page's address to a phone's share sheet, or copies it. Only
 * people with an account here can open it.
 */
function ShareButton({ profile }: { profile: Profile }) {
  const { feedback, run } = useActionFeedback()
  const coarse = useMediaQuery("(pointer: coarse)")
  const url = new URL(
    `/profiles/${encodeURIComponent(profile.user.username)}`,
    window.location.origin,
  ).href
  const canShare = coarse && "share" in navigator
  const canCopy = window.isSecureContext
  if (!canShare && !canCopy) return null
  if (canShare) {
    return (
      <Button
        variant="secondary"
        onClick={() =>
          void navigator
            .share({
              title: tr("profile.shareTitle", { name: displayName(profile) }),
              url,
            })
            .catch((cause: unknown) => {
              // Closing the share sheet isn't a failure.
              if (cause instanceof Error && cause.name === "AbortError") return
              toast.error(tr("profile.shareFailed"), {
                description: errorMessage(cause),
              })
            })
        }
      >
        <Share2Icon />
        {tr("profile.share")}
      </Button>
    )
  }
  return (
    <FeedbackButton
      variant="secondary"
      state={feedback.state}
      successLabel={tr("profile.copied")}
      errorLabel={tr("profile.tryAgain")}
      onClick={() => void run(() => navigator.clipboard.writeText(url))}
    >
      <LinkIcon />
      {tr("profile.copyLink")}
    </FeedbackButton>
  )
}

/**
 * Posters of the owner's favorite titles, then their favorite episodes.
 * Hidden for others when there are none.
 */
function Favorites({ profile }: { profile: Profile }) {
  const { favorites, favoriteItems } = profile
  if (!favorites || !favoriteItems) return null
  const privateNote =
    profile.self && !profile.sharing.favorites ? <PrivateNote /> : undefined
  if (favorites.length === 0 && favoriteItems.length === 0) {
    if (!profile.self) return null
    return (
      <section aria-label={tr("profile.favorites")}>
        <SectionHeading title={tr("profile.favorites")}>
          {privateNote}
        </SectionHeading>
        <StatsEmpty
          compact
          icon={HeartIcon}
          title={tr("profile.noFavorites")}
          description={tr("profile.noFavoritesHint")}
        />
      </section>
    )
  }
  return (
    <>
      {favorites.length > 0 && (
        <Rail title={tr("profile.favorites")} action={privateNote}>
          {favorites.map((title) => (
            <RailItem key={title.id} artwork="poster">
              <PosterCard title={title} />
            </RailItem>
          ))}
        </Rail>
      )}
      {favoriteItems.length > 0 && (
        <Rail
          title={tr("profile.favoriteEpisodes")}
          action={favorites.length === 0 ? privateNote : undefined}
        >
          {favoriteItems.map((item) => (
            <RailItem key={item.id}>
              <EpisodeCard item={item} />
            </RailItem>
          ))}
        </Rail>
      )}
    </>
  )
}

function Statistics({ profile }: { profile: Profile }) {
  const { range = "all" } = Route.useSearch()
  const navigate = Route.useNavigate()
  const stats = useQuery({
    ...orpc.profiles.stats.queryOptions({
      input: { username: profile.user.username, range, timeZone: TIME_ZONE },
    }),
    placeholderData: keepPreviousData,
  })
  const setRange = (next: StatsRange) =>
    void navigate({
      search: { range: next === "all" ? undefined : next },
      replace: true,
      resetScroll: false,
    })
  const data = stats.data
  // With nothing ever watched, picking a period changes nothing.
  const neverWatched =
    data !== undefined && data !== null && range === "all" && !hasPlays(data)

  return (
    <section aria-label={tr("profile.statistics")}>
      <SectionHeading
        title={tr("profile.statistics")}
        action={
          neverWatched ? undefined : (
            <RangePicker value={range} onChange={setRange} />
          )
        }
      >
        {profile.self && !profile.sharing.stats && <PrivateNote />}
      </SectionHeading>
      {stats.isPending ? (
        <WatchStatsSkeleton />
      ) : stats.isError ? (
        <p className="text-muted-foreground text-sm">
          {errorMessage(stats.error)}
        </p>
      ) : !data ? (
        <StatsEmpty
          compact
          icon={LockIcon}
          title={tr("profile.stoppedSharing", { name: displayName(profile) })}
        />
      ) : neverWatched ? (
        profile.self ? (
          <StatsEmpty
            icon={PopcornIcon}
            title={tr("profile.selfEmpty")}
            description={tr("profile.selfEmptyHint")}
            action={
              <Link to="/" className={buttonVariants()}>
                {tr("profile.findSomething")}
              </Link>
            }
          />
        ) : (
          <StatsEmpty
            icon={PopcornIcon}
            title={tr("profile.otherEmpty", { name: displayName(profile) })}
            description={tr("profile.otherEmptyHint")}
          />
        )
      ) : !hasPlays(data) ? (
        <StatsEmpty
          compact
          icon={CalendarDaysIcon}
          title={tr("profile.nothingWatched", { period: rangePhrase(range) })}
          action={
            <Button variant="outline" onClick={() => setRange("all")}>
              {tr("profile.showAllTime")}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4 pt-1">
          <WatchOverview stats={data} figures={watchFigures(data)} />
          <div className={statsGrid}>
            <TopTitlesSection stats={data} />
            <GenresSection stats={data} />
            {/* The third column: where you stand among the people sharing
                their statistics, only on your own profile since the board
                is the viewer's, and when in the week the watching happens. */}
            <div className="flex flex-col gap-4">
              {profile.self && <StandingSection range={range} />}
              <ActivitySection stats={data} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
