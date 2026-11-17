/**
 * An error whose message is already in the user's words, so
 * `errorMessage()` shows it as it is rather than a generic line.
 */
export class ShownError extends Error {
  override name = "ShownError"
}
