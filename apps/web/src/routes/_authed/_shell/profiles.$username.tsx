import { type Profile, StatsRange } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  keepPreviousData,
  type QueryClient,
  useQuery,
} from "@tanstack/solid-query"
import { createFileRoute, Link } from "@tanstack/solid-router"
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Heart,
  Link as LinkIcon,
  Lock,
  LogOut,
  Pencil,
  Popcorn,
  Settings,
  Share2,
  Shield,
  UsersRound,
} from "lucide"
import { createSignal, For, Match, Show, Switch } from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { ProfileAskedRail } from "@/components/asked/asked"
import { FavoriteCard, favoriteKey } from "@/components/favorites"
import { EpisodeCard } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { PartyDialog } from "@/components/party/party-panel"
import { phoneBarButton, PhoneTopBar } from "@/components/phone-nav"
import { Rail, RailItem } from "@/components/rail"
import { RangePicker } from "@/components/stats/range-picker"
import { ActivitySection, StandingSection } from "@/components/stats/standing"
import {
  PrivateNote,
  SectionHeading,
  StatsEmpty,
  statsGrid,
} from "@/components/stats/stat-blocks"
import {
  GenresSection,
  hasPlays,
  TopTitlesSection,
  watchFigures,
  WatchOverview,
  WatchStatsSkeleton,
} from "@/components/stats/watch-stats"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import { FeedbackButton } from "@/kit/feedback-button"
import { Icon } from "@/kit/icon"
import { List, ListItemButton } from "@/kit/list"
import { Skeleton } from "@/kit/skeleton"
import { toast } from "@/kit/toast"
import { formatMonth } from "@/lib/format"
import { usePartyRole } from "@/lib/party"
import { canAny } from "@/lib/permissions"
import { reloadOnEnter } from "@/lib/route-loading"
import { errorMessage, orpc } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import { useSignOut } from "@/lib/sign-out"
import { browserTimeZone, rangePhrase } from "@/lib/stats"
import { useActionFeedback } from "@/lib/use-action-feedback"
import { isPhone, mediaQuery } from "@/lib/viewport"

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

// A profile is never a tab's first page here, so phones always get the bar
// with Back.
function ProfilePage() {
  const params = Route.useParams()
  const context = Route.useRouteContext()
  const openSettings = useOpenSettings()
  const stats = () => canAny(context().user, ["serverStats.read", "stats.read"])
  return (
    <div class={[pageGutter, "sm:pt-8"]}>
      <PhoneTopBar
        title={tr("shell.profile")}
        actions={
          <>
            <Show when={stats()}>
              <Link
                to="/stats"
                aria-label={tr("shell.statistics")}
                class={phoneBarButton}
              >
                <Icon icon={Activity} class="size-6" />
              </Link>
            </Show>
            <button
              type="button"
              aria-label={tr("shell.settings")}
              onClick={() => openSettings()}
              class={phoneBarButton}
            >
              <Icon icon={Settings} class="size-6" />
            </button>
          </>
        }
      />
      <Show when={params().username} keyed>
        {(username) => <ProfileContent username={username} />}
      </Show>
    </div>
  )
}

function ProfileContent(props: { username: string }) {
  const profile = useQuery(() => profileOptions(props.username))
  useDocumentTitle(() => (profile.isSuccess ? displayName(profile.data) : null))
  return (
    <Switch
      fallback={
        <div class="py-24 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">
            {tr("profile.loadFailed")}
          </h1>
          <p class="text-muted-foreground mt-2 text-sm">
            {errorMessage(profile.error)}
          </p>
          <Link
            to="/"
            class={buttonVariants({ variant: "secondary", className: "mt-6" })}
          >
            {tr("profile.backHome")}
          </Link>
        </div>
      }
    >
      <Match when={profile.isPending}>
        <ProfileSkeleton />
      </Match>
      <Match when={profile.isSuccess && profile.data}>
        {(data) => (
          <div class="flex flex-col gap-10">
            <ProfileHeader profile={data()} />
            <Show
              when={
                data().self || data().sharing.favorites || data().sharing.stats
              }
              fallback={
                <StatsEmpty
                  icon={Lock}
                  title={tr("profile.private", { name: displayName(data()) })}
                />
              }
            >
              <Favorites profile={data()} />
              {/* What you asked for is yours alone, never on show to others. */}
              <Show when={data().self}>
                <ProfileAskedRail username={data().user.username} />
              </Show>
              <Show when={statsShown(data())}>
                <Statistics profile={data()} />
              </Show>
              <Show when={data().recent?.length ? data().recent : undefined}>
                {(recent) => (
                  <Rail title={tr("profile.recent")}>
                    <For each={recent()} keyed={(entry) => entry.item.id}>
                      {(entry) => (
                        <RailItem>
                          <EpisodeCard item={entry().item} />
                        </RailItem>
                      )}
                    </For>
                  </Rail>
                )}
              </Show>
            </Show>
            <Show when={data().self && isPhone()}>
              <PhoneAccount />
            </Show>
          </div>
        )}
      </Match>
    </Switch>
  )
}

/**
 * The account on a phone's own profile, as the Flutter app ends it: the
 * watch party and the way out, where the avatar led.
 */
function PhoneAccount() {
  const signOut = useSignOut()
  const partyRole = usePartyRole()
  const [partyOpen, setPartyOpen] = createSignal(false)
  return (
    <>
      <section class="flex flex-col gap-2">
        <h2 class="text-xl font-semibold tracking-tight">
          {tr("settings.section.account.label")}
        </h2>
        <List>
          <ListItemButton
            aria-haspopup="dialog"
            trailing={
              <span class="flex shrink-0 items-center gap-2">
                <Show when={partyRole()}>
                  <span
                    aria-hidden="true"
                    class="bg-primary size-2 rounded-full"
                  />
                  <span class="sr-only">{tr("party.inParty")}</span>
                </Show>
                <Icon
                  icon={ChevronRight}
                  class="text-muted-foreground size-4 shrink-0"
                />
              </span>
            }
            onClick={() => setPartyOpen(true)}
          >
            <Icon icon={UsersRound} class="size-5 shrink-0" />
            <span class="min-w-0 flex-1 truncate font-medium">
              {tr("party.title")}
            </span>
          </ListItemButton>
          <ListItemButton
            class="text-destructive"
            disabled={signOut.isPending}
            trailing={false}
            onClick={() => signOut.mutate()}
          >
            <Icon icon={LogOut} class="size-5 shrink-0" />
            <span class="min-w-0 flex-1 truncate font-medium">
              {tr("shell.signOut")}
            </span>
          </ListItemButton>
        </List>
      </section>
      <PartyDialog open={partyOpen()} onOpenChange={setPartyOpen} />
    </>
  )
}

function ProfileSkeleton() {
  return (
    <div class="flex flex-col gap-10">
      <div class="flex items-center gap-5">
        <Skeleton class="size-16 shrink-0 rounded-full sm:size-20" />
        <div class="flex-1">
          <Skeleton class="h-9 w-56" />
          <Skeleton class="mt-3 h-4 w-40" />
        </div>
      </div>
      <WatchStatsSkeleton />
    </div>
  )
}

/** The picture, the name, and a way to share the page or change it. */
function ProfileHeader(props: { profile: Profile }) {
  const openSettings = useOpenSettings()
  const user = () => props.profile.user
  return (
    <header>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-4">
        <UserAvatar
          user={user()}
          class="size-16 text-2xl shadow-lg shadow-black/40 sm:size-20 sm:text-3xl"
        />
        <div class="min-w-0 flex-1">
          <h1 class="text-26px md:text-32px truncate leading-8 font-semibold tracking-tight max-sm:text-xl max-sm:leading-7 md:leading-10">
            {displayName(props.profile)}
          </h1>
          <p class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Show when={user().displayName}>
              <span>@{user().username}</span>
            </Show>
            <Show when={user().role === "admin"}>
              <span class="inline-flex items-center gap-1">
                <Icon icon={Shield} class="size-3.5" />
                {tr("profile.admin")}
              </span>
            </Show>
            <span>
              {tr("profile.joined", { date: formatMonth(user().createdAt) })}
            </span>
          </p>
        </div>
        {/* A row of its own on phones, so the name keeps the width. */}
        <div class="flex items-center gap-2 max-sm:w-full">
          <Show when={props.profile.self}>
            <Button variant="secondary" onClick={() => openSettings("account")}>
              <Icon icon={Pencil} />
              {tr("profile.edit")}
            </Button>
          </Show>
          <ShareButton profile={props.profile} />
        </div>
      </div>
    </header>
  )
}

/**
 * Hands the page's address to a phone's share sheet, or copies it. Only
 * people with an account here can open it.
 */
function ShareButton(props: { profile: Profile; class?: string }) {
  const { feedback, run } = useActionFeedback()
  const coarse = mediaQuery("(pointer: coarse)")
  const url = () =>
    new URL(
      `/profiles/${encodeURIComponent(props.profile.user.username)}`,
      window.location.origin,
    ).href
  const canShare = () => coarse() && "share" in navigator
  const share = () =>
    void navigator
      .share({
        title: tr("profile.shareTitle", { name: displayName(props.profile) }),
        url: url(),
      })
      .catch((cause: unknown) => {
        // Closing the share sheet isn't a failure.
        if (cause instanceof Error && cause.name === "AbortError") return
        toast.error(tr("profile.shareFailed"), {
          description: errorMessage(cause),
        })
      })
  return (
    <Show
      when={canShare()}
      fallback={
        <Show when={window.isSecureContext}>
          <FeedbackButton
            variant="secondary"
            class={props.class}
            state={feedback().state}
            successLabel={tr("profile.copied")}
            errorLabel={tr("profile.tryAgain")}
            onClick={() => void run(() => navigator.clipboard.writeText(url()))}
          >
            <Icon icon={LinkIcon} />
            {tr("profile.copyLink")}
          </FeedbackButton>
        </Show>
      }
    >
      <Button variant="secondary" class={props.class} onClick={share}>
        <Icon icon={Share2} />
        {tr("profile.share")}
      </Button>
    </Show>
  )
}

/**
 * The owner's latest favorites of every kind in one row of posters. Its
 * heading opens the favorites page, a row for each kind. Hidden for others
 * when there are none.
 */
function Favorites(props: { profile: Profile }) {
  const privateNote = () =>
    props.profile.self && !props.profile.sharing.favorites
  return (
    <Show when={props.profile.favorites}>
      {(favorites) => (
        <Show
          when={favorites().length > 0}
          fallback={
            <Show when={props.profile.self}>
              <section aria-label={tr("profile.favorites")}>
                <SectionHeading title={tr("profile.favorites")}>
                  <Show when={privateNote()}>
                    <PrivateNote />
                  </Show>
                </SectionHeading>
                <StatsEmpty
                  compact
                  icon={Heart}
                  title={tr("profile.noFavorites")}
                  description={tr("profile.noFavoritesHint")}
                />
              </section>
            </Show>
          }
        >
          <Rail
            title={tr("profile.favorites")}
            heading={
              <Link
                to="/profiles/$username/favorites"
                params={{ username: props.profile.user.username }}
                class="focus-visible:ring-ring group/heading inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
              >
                <span class="truncate">{tr("profile.favorites")}</span>
                <Icon
                  icon={ChevronRight}
                  class="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
                />
              </Link>
            }
            action={privateNote() ? <PrivateNote /> : undefined}
          >
            <For each={favorites()} keyed={favoriteKey}>
              {(favorite) => (
                <RailItem artwork="poster">
                  <FavoriteCard favorite={favorite()} />
                </RailItem>
              )}
            </For>
          </Rail>
        </Show>
      )}
    </Show>
  )
}

function Statistics(props: { profile: Profile }) {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const range = (): StatsRange => search().range ?? "all"
  const stats = useQuery(() => ({
    ...statsOptions(props.profile.user.username, range()),
    placeholderData: keepPreviousData,
  }))
  const setRange = (next: StatsRange) =>
    void navigate({
      search: { range: next === "all" ? undefined : next },
      replace: true,
      resetScroll: false,
    })
  // With nothing ever watched, picking a period changes nothing.
  const neverWatched = () =>
    stats.isSuccess &&
    stats.data !== null &&
    range() === "all" &&
    !hasPlays(stats.data)

  return (
    <section aria-label={tr("profile.statistics")}>
      <SectionHeading
        title={tr("profile.statistics")}
        action={
          neverWatched() ? undefined : (
            <RangePicker value={range()} onChange={setRange} />
          )
        }
      >
        <Show when={props.profile.self && !props.profile.sharing.stats}>
          <PrivateNote />
        </Show>
      </SectionHeading>
      <Switch
        fallback={
          <p class="text-muted-foreground text-sm">
            {errorMessage(stats.error)}
          </p>
        }
      >
        <Match when={stats.isPending}>
          <WatchStatsSkeleton />
        </Match>
        <Match when={stats.isSuccess && stats.data === null}>
          <StatsEmpty
            compact
            icon={Lock}
            title={tr("profile.stoppedSharing", {
              name: displayName(props.profile),
            })}
          />
        </Match>
        <Match when={neverWatched()}>
          <Show
            when={props.profile.self}
            fallback={
              <StatsEmpty
                icon={Popcorn}
                title={tr("profile.otherEmpty", {
                  name: displayName(props.profile),
                })}
                description={tr("profile.otherEmptyHint")}
              />
            }
          >
            <StatsEmpty
              icon={Popcorn}
              title={tr("profile.selfEmpty")}
              description={tr("profile.selfEmptyHint")}
              action={
                <Link to="/" class={buttonVariants()}>
                  {tr("profile.findSomething")}
                </Link>
              }
            />
          </Show>
        </Match>
        <Match when={stats.isSuccess && stats.data}>
          {(data) => (
            <Show
              when={hasPlays(data())}
              fallback={
                <StatsEmpty
                  compact
                  icon={CalendarDays}
                  title={tr("profile.nothingWatched", {
                    period: rangePhrase(range()),
                  })}
                  action={
                    <Button variant="outline" onClick={() => setRange("all")}>
                      {tr("profile.showAllTime")}
                    </Button>
                  }
                />
              }
            >
              <div class="flex flex-col gap-4 pt-1">
                <WatchOverview stats={data()} figures={watchFigures(data())} />
                <div class={statsGrid}>
                  <TopTitlesSection stats={data()} />
                  <GenresSection stats={data()} />
                  {/* The third column: where you stand among the people
                      sharing their statistics, only on your own profile
                      since the board is the viewer's, and when in the week
                      the watching happens. */}
                  <div class="flex flex-col gap-4">
                    <Show when={props.profile.self}>
                      <StandingSection range={range()} />
                    </Show>
                    <ActivitySection stats={data()} />
                  </div>
                </div>
              </div>
            </Show>
          )}
        </Match>
      </Switch>
    </section>
  )
}
