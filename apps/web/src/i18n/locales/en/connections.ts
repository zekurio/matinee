import { defineMessages } from "../../catalog"

export default defineMessages("connections", {
  // Settings → Requests: the connections approved requests go through.
  "connections.title": "Connections",
  "connections.add": "Add connection",
  "connections.loadFailed": "Couldn't load the connections. {error}",
  "connections.retry": "Try again",
  "connections.empty.title": "No connections yet",
  "connections.empty.description":
    "Add Radarr, Sonarr, or By hand, and make it the default for films or shows.",
  "connections.testing": "Testing…",
  "connections.connected": "Connected",
  "connections.testFailed.detail": "Test failed. {error}",
  // {variable} is the environment variable, like MATINEE_CONNECTION_FILMS_API_KEY.
  "connections.key.none": "No key yet. Save one, or set {variable}.",
  "connections.actions": "Actions for {name}",
  "connections.test": "Test again",
  "connections.edit": "Edit",
  "connections.delete": "Delete connection",
  "connections.delete.title": "Delete {name}?",
  "connections.delete.descriptionDefault":
    "It's a default, so requests of its kind wait until another connection is.",
  "connections.delete.descriptionUnused":
    "Requests already sent through it stay where they are.",
  "connections.delete.confirm": "Delete",
  "connections.deleted": "Deleted {name}",

  // Adding or editing a connection.
  "connections.dialog.testFirst": "Test the connection to choose its defaults.",
  "connections.dialog.addTitle": "Add connection",
  "connections.dialog.editTitle": "Edit {name}",
  "connections.dialog.source": "Kind",
  "connections.dialog.name": "Name",
  "connections.dialog.namePlaceholder": "Radarr",
  "connections.dialog.slug": "Slug",
  "connections.dialog.slugHint":
    "Names the environment variable the key can come from: {variable}",
  "connections.dialog.slugHintNoKey": "Capital letters, like BY_HAND.",
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
  "connections.dialog.test": "Test",
  "connections.dialog.default.movie": "Default for films",
  "connections.dialog.default.show": "Default for shows",
  "connections.dialog.required": "Fill in {field}.",
  "connections.dialog.checkFields": "Check the fields.",
  "connections.dialog.save": "Save",
  "connections.dialog.create": "Add connection",
  "connections.section.defaults": "Defaults",
  "connections.section.anime": "Anime",
  "connections.section.behaviour": "Behaviour",
  "connections.field.pick": "Choose one",
  "connections.field.unset": "None",
  // An anime field left unset sends anime like everything else.
  "connections.field.sameAsAbove": "Same as above",
  "connections.field.find": "Find",
  "connections.field.findEmpty": "Nothing matches.",
  "connections.field.noChoices": "None on the server yet.",
  // Under a folder: the library titles saved there land in.
  "connections.landsIn": "Lands in {library}",
  "connections.lost": "Can't tell where {folder} is. Choose where it lands.",
  "connections.landsInPick": "Lands in",
  // The folder belongs to a library the account's groups don't open.
  "connections.landsHidden":
    "{folder} is in a library you can't see, so this can't be saved with it. Choose another folder.",

  // A connection's card.
  "connections.card.default.movie": "Default for films",
  "connections.card.default.show": "Default for shows",
  "connections.card.kind.movie": "Films",
  "connections.card.kind.show": "Shows",
  "connections.card.nowhere": "no library",
  "connections.card.hidden": "A library you can't see",
  "connections.card.readOnly":
    "It sends titles to a library you can't see, so you can look at it and test it but not change it.",
  "connections.card.unknownSource": "Unknown source",

  // A connection's override rules.
  "connections.rules.title": "Override rules",
  "connections.rules.add": "Add rule",
  "connections.rules.up": "Move up",
  "connections.rules.down": "Move down",
  "connections.rules.edit": "Edit rule",
  "connections.rules.delete": "Delete rule",
  "connections.rules.delete.title": "Delete this rule?",
  "connections.rules.delete.description":
    "Titles it matched are sent with the connection's settings again.",
  "connections.rules.delete.confirm": "Delete",
  "connections.rules.dialog.addTitle": "Add override rule",
  "connections.rules.dialog.editTitle": "Edit override rule",
  "connections.rules.dialog.create": "Add rule",
  "connections.rules.dialog.save": "Save",
  "connections.rules.conditions": "Conditions",
  "connections.rules.conditions.description":
    "A rule applies to a request that meets every condition filled in here. A condition with several values is met by any one of them.",
  "connections.rules.settings": "Settings",
  "connections.rules.users": "Users",
  "connections.rules.users.find": "Find a user",
  "connections.rules.genres": "Genres",
  "connections.rules.genres.find": "Find a genre",
  "connections.rules.languages": "Languages",
  "connections.rules.languages.find": "Find a language",
  "connections.rules.keywords": "Keywords",
  "connections.rules.keywords.find": "Search TMDB's keywords",
  // The keyword list, before there's enough typed to search with.
  "connections.rules.keywords.type": "Type two letters or more to search.",
  "connections.rules.keywords.searching": "Searching…",
  "connections.rules.noTmdb":
    "Genres and keywords come from TMDB, which isn't set up.",
  // A rule setting left unset keeps the connection's value.
  "connections.rules.keep": "Connection's",
  // Shown in a rule's row until its choices load.
  "connections.rules.summaryPending": "Details appear once they load.",
  // A user, genre, or language a rule names that is no longer there.
  "connections.rules.unknownChoice": "unknown",
  // A saved user, genre, or language, until the names load.
  "connections.rules.loadingChoice": "Loading…",

  // Which connection fills each library.
  "connections.libraries.title": "What fills each library",
  "connections.libraries.filledBy": "Filled by {connections}",
  "connections.libraries.unfilled": "Nothing fills it",
  "connections.libraries.noProvider": "No metadata provider",
})
