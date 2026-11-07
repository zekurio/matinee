import { Button } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronRightIcon,
  FolderIcon,
  HardDriveIcon,
  PlusIcon,
} from "lucide-react"
import { Fragment, useState } from "react"

import { tr } from "@/i18n"
import { errorMessage, orpc } from "@/lib/rpc"

/** The root shows as a drive; other folders by name. */
function CrumbName({ path, name }: { path: string; name: string }) {
  if (path !== "/") return name
  return (
    <>
      <HardDriveIcon className="size-4" />
      <span className="sr-only">{tr("libraries.browser.root")}</span>
    </>
  )
}

function folderName(path: string): string {
  return path.split("/").findLast(Boolean) ?? "/"
}

function crumbs(path: string) {
  const parts = path.split("/").filter(Boolean)
  return [
    { name: "/", path: "/" },
    ...parts.map((name, i) => ({
      name,
      path: `/${parts.slice(0, i + 1).join("/")}`,
    })),
  ]
}

/** Walk the server's folders and pick one for a library. */
export function FolderBrowser({
  onPick,
  picked,
  initialPath,
}: {
  onPick: (path: string) => void
  picked: string[]
  /** Where to open. The server root when unset. */
  initialPath?: string
}) {
  const [path, setPath] = useState<string | undefined>(initialPath)
  const listing = useQuery({
    ...orpc.admin.browse.queryOptions({ input: { path } }),
    staleTime: 5_000,
  })
  const current = listing.data?.path ?? path ?? "/"
  const alreadyPicked = picked.includes(current)

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/50 flex items-center gap-2 border-b py-1.5 pr-1.5 pl-3">
        <nav
          aria-label={tr("libraries.browser.current")}
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm whitespace-nowrap"
        >
          {crumbs(current).map((crumb, i, all) => (
            <Fragment key={crumb.path}>
              {i > 0 && (
                <ChevronRightIcon className="text-muted-foreground size-3.5 shrink-0" />
              )}
              {i === all.length - 1 ? (
                <span
                  aria-current="location"
                  className="inline-flex h-7 items-center px-1.5 font-medium"
                >
                  <CrumbName path={crumb.path} name={crumb.name} />
                </span>
              ) : (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-7 items-center rounded-md px-1.5 outline-none focus-visible:ring-2"
                  onClick={() => setPath(crumb.path)}
                >
                  <CrumbName path={crumb.path} name={crumb.name} />
                </button>
              )}
            </Fragment>
          ))}
        </nav>
        {current !== "/" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={alreadyPicked}
            onClick={() => onPick(current)}
          >
            <PlusIcon />
            {alreadyPicked
              ? tr("libraries.browser.added")
              : tr("libraries.browser.addCurrent", {
                  name: folderName(current),
                })}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground border-b px-3 py-2 text-[13px]">
        {current === "/"
          ? tr("libraries.browser.openRoot")
          : alreadyPicked
            ? tr("libraries.browser.alreadyAdded", { path: current })
            : tr("libraries.browser.adds", { path: current })}
      </p>
      <div className="h-52 overflow-y-auto p-1">
        {listing.isPending ? (
          <div className="flex flex-col gap-1 p-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : listing.error ? (
          <p className="text-destructive p-3 text-sm">
            {errorMessage(listing.error)}
          </p>
        ) : listing.data?.directories.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            {tr("libraries.browser.empty")}
          </p>
        ) : (
          <ul>
            {listing.data?.directories.map((dir) => {
              const added = picked.includes(dir.path)
              return (
                <li
                  key={dir.path}
                  className="group/row hover:bg-foreground/[0.06] relative rounded-md"
                >
                  <button
                    type="button"
                    aria-label={tr("libraries.browser.open", {
                      name: dir.name,
                    })}
                    className="focus-visible:ring-ring flex h-9 w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
                    onClick={() => setPath(dir.path)}
                  >
                    <FolderIcon className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{dir.name}</span>
                    <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={tr("libraries.browser.addNamed", {
                      name: dir.name,
                    })}
                    disabled={added}
                    className="absolute top-1/2 right-8 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 disabled:opacity-60 [@media(hover:none)]:opacity-100"
                    onClick={() => onPick(dir.path)}
                  >
                    {added
                      ? tr("libraries.browser.added")
                      : tr("libraries.browser.add")}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
