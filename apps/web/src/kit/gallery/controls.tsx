import {
  ChevronDown,
  CircleAlert,
  Folder,
  Info,
  Library,
  Plus,
  Settings,
  Users,
  X,
} from "lucide"
import { For } from "solid-js"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/kit/alert"
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/kit/avatar"
import { Badge } from "@/kit/badge"
import { Button } from "@/kit/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/kit/card"
import { Checkbox } from "@/kit/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/kit/collapsible"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/kit/empty"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/kit/field"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { Label } from "@/kit/label"
import { List, ListItem, ListItemButton } from "@/kit/list"
import { ScrollArea } from "@/kit/scroll-area"
import { Separator } from "@/kit/separator"
import { Skeleton } from "@/kit/skeleton"
import { Slider } from "@/kit/slider"
import { Spinner } from "@/kit/spinner"
import { Switch } from "@/kit/switch"
import { Textarea } from "@/kit/textarea"

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link",
] as const

const AVATAR_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%236366f1'/%3E%3Ccircle cx='32' cy='24' r='12' fill='%23fde68a'/%3E%3Cpath d='M8 64c0-14 11-24 24-24s24 10 24 24z' fill='%23fde68a'/%3E%3C/svg%3E"

const SCROLL_ROWS = [
  "The Quiet Light",
  "Northern Lines",
  "A Room in Winter",
  "Paper Cities",
  "The Long Weekend",
  "Salt and Iron",
  "Night Bus",
  "Small Hours",
  "The Glass House",
  "Everything Blue",
  "After the Rain",
  "Slow Country",
]

/** Buttons, fields and the other controls of the kit, for checking by eye. */
export function KitControls() {
  return (
    <>
      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Spinner</h2>
        <div class="text-muted-foreground flex items-center gap-3 text-sm">
          <Spinner />
          <span>Loading your library…</span>
          <Spinner class="size-6" />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Skeleton</h2>
        <div class="flex items-center gap-3">
          <Skeleton class="size-10 rounded-full" />
          <div class="flex flex-col gap-2">
            <Skeleton class="h-4 w-48" />
            <Skeleton class="h-4 w-32" />
          </div>
        </div>
        <Skeleton class="h-24 w-full max-w-md rounded-xl" />
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Separator</h2>
        <div class="flex max-w-md flex-col gap-3 text-sm">
          <div class="flex flex-col gap-1">
            <span class="font-medium">Hollis Grant</span>
            <span class="text-muted-foreground">hollis@example.com</span>
          </div>
          <Separator />
          <p class="text-muted-foreground">
            Designs the billing and onboarding flows, and reviews every new
            pricing page.
          </p>
        </div>
        <div class="flex h-10 items-center gap-3 text-sm">
          <span>Movies</span>
          <Separator orientation="vertical" />
          <span>Shows</span>
          <Separator orientation="vertical" />
          <span>Music</span>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Badge</h2>
        <div class="flex flex-wrap items-center gap-2">
          <For each={BADGE_VARIANTS}>
            {(variant) => <Badge variant={variant}>{variant}</Badge>}
          </For>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Badge>
            <Icon icon={CircleAlert} data-icon="inline-start" />3 warnings
          </Badge>
          <Badge variant="secondary">HDR</Badge>
          <Badge variant="outline">S01E04</Badge>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Empty</h2>
        <Empty class="max-w-md border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon icon={Library} />
            </EmptyMedia>
            <EmptyTitle>No libraries yet</EmptyTitle>
            <EmptyDescription>
              Add a folder of films or shows and Matinee will scan it for you.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button>
              <Icon icon={Plus} />
              Add library
            </Button>
          </EmptyContent>
        </Empty>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">List</h2>
        <List class="max-w-md">
          <ListItem>
            <Icon icon={Library} class="text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">Movies</p>
              <p class="text-muted-foreground text-xs">1,204 titles</p>
            </div>
          </ListItem>
          <ListItem>
            <Icon icon={Folder} class="text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">Shows</p>
              <p class="text-muted-foreground text-xs">86 series</p>
            </div>
          </ListItem>
          <ListItemButton>
            <Icon icon={Users} class="text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">Viewers</p>
              <p class="text-muted-foreground text-xs">4 accounts</p>
            </div>
          </ListItemButton>
        </List>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Card</h2>
        <Card class="max-w-md">
          <CardHeader>
            <CardTitle>Continue watching</CardTitle>
            <CardDescription>Pick up where you left off.</CardDescription>
            <CardAction>
              <Badge variant="secondary">4K</Badge>
            </CardAction>
          </CardHeader>
          <CardContent class="text-muted-foreground">
            The Quiet Light · S01E03 · 24 minutes left
          </CardContent>
          <CardFooter class="gap-2">
            <Button size="sm">Resume</Button>
            <Button size="sm" variant="ghost">
              Details
            </Button>
          </CardFooter>
        </Card>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Alert</h2>
        <div class="flex max-w-xl flex-col gap-3">
          <Alert>
            <Icon icon={Info} />
            <AlertTitle>Scan finished</AlertTitle>
            <AlertDescription>
              Matinee added 18 titles to Movies and matched all of them.
            </AlertDescription>
            <AlertAction>
              <Button size="icon-xs" variant="ghost" aria-label="Dismiss">
                <Icon icon={X} />
              </Button>
            </AlertAction>
          </Alert>
          <Alert variant="destructive">
            <Icon icon={CircleAlert} />
            <AlertTitle>Library unavailable</AlertTitle>
            <AlertDescription>
              The folder at /media/films could not be read. Check that it is
              still mounted.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Label</h2>
        <div class="flex max-w-sm flex-col gap-2">
          <Label for="gallery-search">Search</Label>
          <Input id="gallery-search" placeholder="Search titles…" />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Input</h2>
        <div class="flex max-w-sm flex-col gap-3">
          <Input placeholder="Search your library…" />
          <Input type="email" placeholder="you@example.com" />
          <Input disabled value="Read only for now" />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Textarea</h2>
        <Textarea
          class="max-w-sm"
          placeholder="Add a note for this title…"
          defaultValue="Watch with the director commentary next time."
        />
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Field</h2>
        <div class="flex max-w-sm flex-col gap-5">
          <Field name="server">
            <FieldLabel>Server address</FieldLabel>
            <Input placeholder="https://media.example.com" />
            <FieldDescription>
              Used when this library is shared with other people.
            </FieldDescription>
          </Field>
          <Field name="email" invalid>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" defaultValue="hollis@" />
            <FieldError>Enter a valid email address.</FieldError>
          </Field>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Switch</h2>
        <div class="flex max-w-sm flex-col gap-3 text-sm">
          <label class="flex items-center justify-between gap-4">
            <span>Play the next episode automatically</span>
            <Switch
              defaultChecked
              aria-label="Play the next episode automatically"
            />
          </label>
          <label class="flex items-center justify-between gap-4">
            <span>Show subtitles by default</span>
            <Switch aria-label="Show subtitles by default" />
          </label>
          <label class="flex items-center justify-between gap-4">
            <span>Allow downloads</span>
            <Switch disabled aria-label="Allow downloads" />
          </label>
          <label class="flex items-center justify-between gap-4">
            <span>Small switch</span>
            <Switch size="sm" defaultChecked aria-label="Small switch" />
          </label>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Checkbox</h2>
        <div class="flex flex-col gap-3 text-sm">
          <Label class="w-fit">
            <Checkbox defaultChecked aria-label="Include movies" />
            Include movies
          </Label>
          <Label class="w-fit">
            <Checkbox aria-label="Include shows" />
            Include shows
          </Label>
          <Label class="w-fit">
            <Checkbox disabled aria-label="Include music" />
            Include music
          </Label>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Slider</h2>
        <div class="flex w-full max-w-sm flex-col gap-2">
          <div class="flex items-center justify-between text-sm">
            <span>Playback volume</span>
            <span class="text-muted-foreground">60%</span>
          </div>
          <Slider
            defaultValue={[60]}
            min={0}
            max={100}
            step={1}
            thumbLabel={() => "Playback volume"}
            thumbValueText={(value) => `${value}%`}
          />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Avatar</h2>
        <div class="flex items-center gap-4">
          <Avatar>
            <AvatarImage src={AVATAR_IMAGE} alt="Hollis Grant" />
            <AvatarFallback>HG</AvatarFallback>
            <AvatarBadge />
          </Avatar>
          <Avatar size="lg">
            <AvatarFallback>IM</AvatarFallback>
          </Avatar>
          <Avatar size="sm">
            <AvatarFallback>KT</AvatarFallback>
          </Avatar>
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>HG</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>IM</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+6</AvatarGroupCount>
          </AvatarGroup>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Scroll area</h2>
        <ScrollArea type="auto" class="h-48 max-w-sm rounded-xl border">
          <div class="flex flex-col gap-1 p-4 text-sm">
            <p class="mb-1 font-medium">Recently added</p>
            <For each={SCROLL_ROWS}>
              {(title, index) => (
                <div class="flex items-center gap-3 rounded-lg px-2 py-1.5">
                  <span class="text-muted-foreground w-5 text-right text-xs">
                    {index() + 1}
                  </span>
                  <span>{title}</span>
                </div>
              )}
            </For>
          </div>
        </ScrollArea>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Collapsible</h2>
        <Collapsible class="max-w-md" defaultOpen>
          <CollapsibleTrigger class="group hover:bg-surface-hover focus-visible:ring-ring flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2">
            <span class="flex items-center gap-2">
              <Icon icon={Settings} class="text-muted-foreground size-4" />
              Playback settings
            </span>
            <Icon
              icon={ChevronDown}
              class="size-4 transition-transform group-data-[open]:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent class="text-muted-foreground px-3 py-2 text-sm">
            Prefer surround sound when the device supports it, and start each
            episode with subtitles in the library's language.
          </CollapsibleContent>
        </Collapsible>
      </section>
    </>
  )
}
