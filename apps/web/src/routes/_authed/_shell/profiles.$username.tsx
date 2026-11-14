import { type Profile, StatsRange } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import { FeedbackButton } from "@matinee/ui/components/feedback-button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import {
  keepPreviousData,
  type QueryClient,
  useQuery,
} from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  CalendarDaysIcon,
  ChartColumnIcon,
  ChevronRightIcon,
  HeartIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  PopcornIcon,
  InboxIcon,
  SettingsIcon,
  Share2Icon,
  ShieldIcon,
} from "lucide-react"

import { ProfileAskedRail } from "@/components/asked/asked"
import { FavoriteCard, favoriteKey } from "@/components/favorites"
import { EpisodeCard } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { PhoneTopBar, usePhoneTab } from "@/components/phone-nav"
import { Rail, RailItem } from "@/components/rail"
import { useNeedsYou } from "@/components/requests/request-queue"
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
import { reloadOnEnter } from "@/lib/route-loading"
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
  loaderDeps: ({ search }) => ({ range: search.range }),
  // Starts the profile's fetch while the page's code loads, and on hover,
  // and its statistics as soon as the profile says they show.
  shouldReload: reloadOnEnter,
  loader: ({ context, params, deps }) => {
    void preloadProfile(context.queryClient, params.username, deps.range)
  },
  component: ProfilePage,
})

function profileOptions(username: string) {
  return orpc.profiles.get.queryOptions({ input: { username } })
}

// The loader runs with the app's code, so the time zone is read when asked
// for rather than as the app starts.
function statsOptions(username: string, range: StatsRange) {
  return orpc.profiles.stats.queryOptions({
    input: { username, range, timeZone: browserTimeZone() },
  })
}

async function preloadProfile(
  queryClient: QueryClient,
  username: string,
  range: StatsRange = "all",
) {
  const options = profileOptions(username)
  await queryClient.prefetchQuery(options)
  const profile = queryClient.getQueryData(options.queryKey)
  if (!profile || !statsShown(profile)) return
  await queryClient.prefetchQuery(statsOptions(profile.user.username, range))
}

/** Whether the page shows the profile's statistics. */
function statsShown(profile: Profile) {
  return profile.self || profile.sharing.stats
}

function displayName(profile: Profile): string {
  return profile.user.displayName ?? profile.user.username
}

function ProfilePage() {
  // Your own is the profile tab's first page on phones; anyone else's has
  // the bar with Back.
  const bar = usePhoneTab() === null && <PhoneTopBar home />
  return (
    <>
      {bar}
      <ProfileContent />
    </>
  )
}

function ProfileContent() {
  const { username } = Route.useParams()
  const profile = useQuery(profileOptions(username))
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
          {/* What you asked for is yours alone, never on show to others. */}
          {data.self && <ProfileAskedRail username={data.user.username} />}
          {statsShown(data) && <Statistics profile={data} />}
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

// Your own profile on a phone starts under the status bar, without a bar.
const ownTop = "max-sm:pt-[calc(env(safe-area-inset-top)+1rem)]"

function ProfileSkeleton() {
  const own = usePhoneTab() === "profile"
  return (
    <div className={cn("flex flex-col gap-10", own && ownTop)}>
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

/**
 * The picture, the name, and a way to share the page or change it. Your
 * own on a phone is one row, as the Android app's profile tab: the
 * picture, who it is, and statistics and Settings at its end.
 */
function ProfileHeader({ profile }: { profile: Profile }) {
  const { user } = profile
  const openSettings = useOpenSettings()
  const own = usePhoneTab() === "profile"
  return (
    <header className={cn(own && ownTop)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-6 gap-y-4",
          own && "max-sm:flex-nowrap max-sm:gap-x-4",
        )}
      >
        <UserAvatar
          user={user}
          className="size-16 text-2xl shadow-lg shadow-black/40 sm:size-20 sm:text-3xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] leading-8 font-semibold tracking-tight max-sm:text-[22px] max-sm:leading-7 md:text-[32px] md:leading-10">
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
            <Button
              variant="secondary"
              onClick={() => openSettings("account")}
              className={cn(own && "max-sm:hidden")}
            >
              <PencilIcon />
              {tr("profile.edit")}
            </Button>
          )}
          <ShareButton
            profile={profile}
            className={cn(own && "max-sm:hidden")}
          />
          {own && (
            <>
              {user.role === "admin" && <RequestsButton />}
              <Link
                to="/stats"
                aria-label={tr("shell.statistics")}
                className={cn(roundButton, "sm:hidden")}
              >
                <ChartColumnIcon />
              </Link>
              <button
                type="button"
                aria-label={tr("shell.settings")}
                onClick={() => openSettings()}
                className={cn(roundButton, "sm:hidden")}
              >
                <SettingsIcon />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

/** The admin's way to the queue on a phone, with the dot while it needs them. */
function RequestsButton() {
  const needsYou = useNeedsYou(true)
  return (
    <Link
      to="/requests"
      aria-label={
        needsYou > 0
          ? tr("requests.menuWaiting", { count: needsYou })
          : tr("requests.menu")
      }
      className={cn(roundButton, "relative sm:hidden")}
    >
      <InboxIcon />
      {needsYou > 0 && (
        <span
          aria-hidden
          className="bg-primary ring-secondary absolute top-1.5 right-1.5 size-2 rounded-full ring-2"
        />
      )}
    </Link>
  )
}

/** A round button at the end of your own profile's row on a phone. */
const roundButton =
  "bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-ring grid size-11 shrink-0 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 [&_svg]:size-5"

/**
 * Hands the page's address to a phone's share sheet, or copies it. Only
 * people with an account here can open it.
 */
function ShareButton({
  profile,
  className,
}: {
  profile: Profile
  className?: string
}) {
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
        className={className}
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
      className={className}
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
 * The owner's latest favorites of every kind in one row of posters. Its
 * heading opens the favorites page, a row for each kind. Hidden for others
 * when there are none.
 */
function Favorites({ profile }: { profile: Profile }) {
  const { favorites } = profile
  if (!favorites) return null
  const privateNote =
    profile.self && !profile.sharing.favorites ? <PrivateNote /> : undefined
  if (favorites.length === 0) {
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
    <Rail
      title={tr("profile.favorites")}
      heading={
        <Link
          to="/profiles/$username/favorites"
          params={{ username: profile.user.username }}
          className="focus-visible:ring-ring group/heading inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
        >
          <span className="truncate">{tr("profile.favorites")}</span>
          <ChevronRightIcon
            aria-hidden
            className="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
          />
        </Link>
      }
      action={privateNote}
    >
      {favorites.map((favorite) => (
        <RailItem key={favoriteKey(favorite)} artwork="poster">
          <FavoriteCard favorite={favorite} />
        </RailItem>
      ))}
    </Rail>
  )
}

function Statistics({ profile }: { profile: Profile }) {
  const { range = "all" } = Route.useSearch()
  const navigate = Route.useNavigate()
  const stats = useQuery({
    ...statsOptions(profile.user.username, range),
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
