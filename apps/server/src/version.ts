import root from "../../../package.json" with { type: "json" }

/** The server's version, the one every part of Matinee has. */
export const SERVER_VERSION: string = root.version
