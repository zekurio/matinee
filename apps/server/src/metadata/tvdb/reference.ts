import { uniqueNames } from "../types"
import { request } from "./client"
import type { ArtworkType, Company, CompanyType } from "./payloads"

let artworkTypes: Promise<ArtworkType[]> | null = null

/** Artwork type ids by record and name, such as series/poster → 2. */
export async function artworkType(
  record: "series" | "season" | "movie",
  name: "poster" | "background" | "clearlogo",
): Promise<number | null> {
  artworkTypes ??= request<ArtworkType[]>("/artwork/types")
    .then((res) => res.data)
    .catch((cause: unknown) => {
      artworkTypes = null
      throw cause
    })
  const types = await artworkTypes
  return (
    types.find((t) => t.recordType === record && t.name.toLowerCase() === name)
      ?.id ?? null
  )
}

let companyTypes: Promise<CompanyType[]> | null = null

/** Company type ids by name, such as Studio. */
async function companyType(name: string): Promise<number | null> {
  companyTypes ??= request<CompanyType[]>("/companies/types")
    .then((res) => res.data)
    .catch((cause: unknown) => {
      companyTypes = null
      throw cause
    })
  const types = await companyTypes
  return types.find((t) => t.companyTypeName === name)?.companyTypeId ?? null
}

/** The studios, or the production companies when TVDB names no studio. */
export async function seriesStudios(companies: Company[] | null | undefined) {
  const [studio, production] = await Promise.all([
    companyType("Studio"),
    companyType("Production Company"),
  ])
  const ofType = (type: number | null) =>
    uniqueNames(
      (companies ?? [])
        .filter((c) => type !== null && c.primaryCompanyType === type)
        .map((c) => c.name),
    )
  const studios = ofType(studio)
  return studios.length > 0 ? studios : ofType(production)
}
