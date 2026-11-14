import { defineMessages, plural } from "../../catalog"

export default defineMessages("connections", {
  // Settings → Requests: the connections approved requests go through.
  "connections.title": "Connections",
  "connections.add": "Add connection",
  "connections.loadFailed": "Couldn't load the connections. {error}",
  "connections.retry": "Try again",
  "connections.empty.title": "No connections yet",
  "connections.empty.description":
    "Add one, then choose the libraries it fills.",
  "connections.testing": "Testing…",
  "connections.connected": "Connected",
  "connections.testFailed": "Test failed",
  // {variable} is the environment variable, like MATINEE_CONNECTION_FILMS_API_KEY.
  "connections.slug": "Slug",
  "connections.key.saved": "Key saved in Matinee, used instead of {variable}",
  "connections.key.environment": "Key from {variable}",
  "connections.key.none": "No key yet. Save one, or set {variable}.",
  "connections.actions": "Actions for {name}",
  "connections.test": "Test again",
  "connections.edit": "Edit",
  "connections.delete": "Delete connection",
  "connections.delete.title": "Delete {name}?",
  "connections.delete.description": plural({
    one: "{count} library stops taking requests until another connection fills it.",
    other:
      "{count} libraries stop taking requests until another connection fills them.",
  }),
  "connections.delete.descriptionUnused": "It doesn't fill any library.",
  "connections.delete.confirm": "Delete",
  "connections.deleted": "Deleted {name}",

  // Adding or editing a connection.
  "connections.dialog.addTitle": "Add connection",
  "connections.dialog.editTitle": "Edit {name}",
  "connections.dialog.source": "Kind",
  "connections.dialog.name": "Name",
  "connections.dialog.namePlaceholder": "Films",
  "connections.dialog.slug": "Slug",
  "connections.dialog.slugHint":
    "Names the environment variable the key can come from: {variable}",
  "connections.dialog.slugHintNoKey": "Capital letters, like FILMS.",
  "connections.dialog.slugInvalid":
    "Use capital letters, digits and underscores, starting with a letter.",
  "connections.dialog.key": "API key",
  "connections.dialog.keySaved": "Saved. Type to replace it.",
  "connections.dialog.keyFromEnvironment": "Set by {variable}",
  "connections.dialog.keyNone": "None",
  "connections.dialog.keyUseEnvironment": "Use the key from the environment",
  "connections.dialog.keyRemove": "Remove the saved key",
  "connections.dialog.keyKeep": "Keep the saved key",
  "connections.dialog.keyEnvironmentApplies":
    "The key from {variable} applies once you save.",
  "connections.dialog.keyRemoved": "The key is removed when you save.",
  "connections.dialog.required": "Fill in {field}.",
  "connections.dialog.checkFields": "Check the fields.",
  "connections.dialog.save": "Save",
  "connections.dialog.create": "Add connection",

  // What fills each library.
  "connections.libraries.title": "What fills each library",
  "connections.libraries.loadFailed": "Couldn't load the libraries. {error}",
  "connections.libraries.none": "There are no libraries yet.",
  "connections.fillFrom": "Fill from",
  "connections.fillFrom.nothing": "Nothing",
  "connections.libraries.noProvider":
    "No metadata provider, so requests can't go here. Choose one under Libraries.",
  "connections.libraries.noConnection": "Add a connection above first.",
  "connections.libraries.nothingFits": "No connection takes {kind}.",
  "connections.libraries.kind.movies": "movies",
  "connections.libraries.kind.shows": "shows",
  "connections.libraries.loadingChoices": "Loading choices from {name}…",
  "connections.libraries.choicesFailed":
    "Couldn't load the choices from {name}. {error}",
  "connections.libraries.noChoices": "{name} offers no choices for this.",
  "connections.libraries.pick": "Choose one",
  "connections.libraries.saveFailed": "Couldn't save {library}. {error}",
  "connections.libraries.elsewhere":
    "{folder} isn't a folder of {library}. Fine if {connection} sees it under another path.",
  // The options anime is sent with instead, under a library's own.
  "connections.anime": "Anime",
  "connections.anime.off": "Sent like everything else",
  "connections.anime.lands": "Lands in {library}",
  "connections.anime.choose": "Choose where it lands",
  "connections.anime.lost":
    "Can't tell where {folder} is. Choose where anime lands.",
  "connections.anime.lostNoFolder": "Choose where anime lands.",
  "connections.anime.landsIn": "Lands in",
  "connections.anime.clear": "Send anime like everything else",
  // On the row of a library another library's anime lands in.
  "connections.anime.from": "Anime from {libraries} lands here.",
})
