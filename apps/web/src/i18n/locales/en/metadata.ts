import { defineMessages } from "../../catalog"

export default defineMessages("metadata", {
  // Where a show is in its run, beside its year and seasons. The server
  // maps the metadata provider's word to one of these, as Jellyfin does.
  "metadata.status.continuing": "Continuing",
  "metadata.status.ended": "Ended",
  "metadata.status.unreleased": "Not yet released",
})
