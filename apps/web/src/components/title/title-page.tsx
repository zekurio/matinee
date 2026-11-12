import { buttonVariants } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { getRouteApi, Link } from "@tanstack/react-router"

import { pageBleed, pageColumn } from "@/components/app-shell"
import { CastRail } from "@/components/credits"
import { useDocumentTitle } from "@/components/page-header"
import { tr } from "@/i18n"
import { errorMessage } from "@/lib/rpc"

import { ShowEpisodes } from "./episodes"
import { NextUp } from "./next-up"
import { onlySeason } from "./seasons"
import { SeasonsRail } from "./seasons-rail"
import { TitleHeader } from "./title-header"
import { titleOptions } from "./title-queries"

const route = getRouteApi("/_authed/_shell/titles/$titleId")

export function TitlePage() {
  const { titleId } = route.useParams()
  const title = useQuery(titleOptions(titleId))

  useDocumentTitle(title.data?.name)

  if (title.isPending) return <TitleSkeleton />
  if (!title.data) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {tr("title.loadError")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {errorMessage(title.error)}
        </p>
        <Link
          to="/"
          className={buttonVariants({
            variant: "secondary",
            className: "mt-6",
          })}
        >
          {tr("title.backHome")}
        </Link>
      </div>
    )
  }
  const only = onlySeason(title.data)
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <TitleHeader title={title.data} />
      {title.data.kind === "show" && (
        <>
          <NextUp title={title.data} />
          {only ? (
            <ShowEpisodes
              key={title.data.id}
              title={title.data}
              season={only}
            />
          ) : (
            <SeasonsRail title={title.data} />
          )}
        </>
      )}
      <CastRail credits={title.data.credits} />
    </div>
  )
}

export function TitleSkeleton() {
  return (
    <div className={pageBleed}>
      <Skeleton className="h-[min(46vh,420px)] w-full rounded-none sm:h-[min(48vh,400px)]" />
      <div className={cn(pageColumn, "-mt-40 flex gap-4 sm:gap-8")}>
        <Skeleton className="aspect-[2/3] w-24 shrink-0 rounded-lg sm:w-48 lg:w-56 2xl:w-64" />
        <div className="flex-1 pt-16 sm:pt-24">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="mt-4 h-4 w-1/3" />
          <Skeleton className="mt-6 h-16 w-full max-w-xl" />
        </div>
      </div>
    </div>
  )
}
