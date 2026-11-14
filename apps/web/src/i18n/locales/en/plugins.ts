import { defineMessages, plural } from "../../catalog"

export default defineMessages("plugins", {
  // Settings → Plugins, the list.
  "plugins.installed": "Installed",
  "plugins.builtin": "Built in",
  "plugins.add": "Add plugin",
  "plugins.empty.title": "No plugins yet",
  "plugins.empty.description":
    "Plugins add metadata sources, ways to sign in, and listeners for what happens on the server.",
  "plugins.loadFailed": "Couldn't load the plugins. {error}",
  "plugins.retry": "Try again",
  // The server answers that its plugin manager isn't there.
  "plugins.unavailable": "This server can't run plugins yet.",
  "plugins.foldersHint": "Plugin folders on the server show up here.",
  "plugins.rescan": "Look for folders",
  "plugins.rescanned": "Looked for plugin folders",
  "plugins.rescanFailed": "Couldn't look for plugin folders",
  "plugins.row.toggle": "Turn {name} on",
  "plugins.row.update": "Update to {version}",
  // A plugin found in a folder that was never approved.
  "plugins.row.unapproved": "Not approved yet",
  // A plugin that runs, but whose events stopped getting through at all.
  "plugins.row.deliveryBlocked": "Events not getting through",
  // A plugin that runs, where a few events keep failing and the rest
  // get through.
  "plugins.row.deliveryFailing": plural({
    one: "{count} event keeps failing",
    other: "{count} events keep failing",
  }),
  "plugins.enableFailed": "Couldn't turn on {name}",
  "plugins.disableFailed": "Couldn't turn off {name}",
  "plugins.version": "Version {version}",
  "plugins.by": "By {author}",
  "plugins.homepage": "Homepage",

  // A plugin's state, in a word or two.
  "plugins.state.running": "Running",
  "plugins.state.starting": "Starting",
  "plugins.state.disabled": "Off",
  "plugins.state.needs-approval": "Needs approval",
  "plugins.state.needs-config": "Needs settings",
  "plugins.state.error": "Stopped with an error",
  "plugins.state.missing": "Files missing",
  "plugins.state.incompatible": "Can't run",

  // Where a plugin came from. {host} is the address it was downloaded from.
  "plugins.source.builtin": "Built in",
  "plugins.source.npm": "From npm",
  "plugins.source.url": "From {host}",
  "plugins.source.directory": "From a folder",

  // What a plugin adds to Matinee.
  "plugins.provides.metadata": "Metadata",
  "plugins.provides.auth": "Sign-in",
  "plugins.provides.events": "Events",

  // Event names, as a plugin's permissions list them.
  "plugins.event.library.scanned": "Library scanned",
  "plugins.event.title.added": "Title added",
  "plugins.event.title.matched": "Title matched",
  "plugins.event.playback.started": "Playback started",
  "plugins.event.playback.stopped": "Playback stopped",
  "plugins.event.playback.watched": "Marked watched",
  "plugins.event.user.created": "Account created",

  // A plugin's page.
  "plugins.detail.back": "Plugins",
  "plugins.actions": "Actions for {name}",
  "plugins.detail.from.npm": "Package",
  "plugins.detail.from.url": "Address",
  "plugins.detail.from.directory": "Folder",
  "plugins.detail.from.builtin": "Source",
  "plugins.detail.status": "Status",
  "plugins.detail.enabled": "On",
  "plugins.detail.permissions": "What it may do",
  "plugins.detail.settings": "Settings",
  "plugins.detail.signIn": "Sign-in",
  "plugins.detail.log": "Log",
  "plugins.detail.externalFolder":
    "This plugin comes from a folder Matinee only reads. To remove it, delete it there, then look for folders again.",
  "plugins.restart": "Restart",
  "plugins.restartFailed": "Couldn't restart {name}",
  "plugins.leave.title": "Leave without saving?",
  "plugins.leave.description":
    "Your changes to the settings of {name} aren't saved yet.",
  "plugins.leave.stay": "Keep editing",
  "plugins.leave.discard": "Discard changes",

  // Why a plugin is in its state, under the state.
  "plugins.reason.builtin":
    "Built-in plugins are part of Matinee and always on.",
  "plugins.reason.starting": "Starting up.",
  "plugins.reason.disabled": "Turn it on to start it.",
  "plugins.reason.disabledUnapproved":
    "Approve what it asks for above to turn it on.",
  "plugins.reason.needsApproval":
    "It stays stopped until you approve what it asks for.",
  "plugins.reason.needsConfig": "Fill in {fields} under Settings to start it.",
  "plugins.reason.needsConfigAny": "Fill in its settings to start it.",
  // Saved values the plugin's current version no longer takes, as after
  // an update that dropped an option. {fields} is a list of setting names.
  "plugins.reason.invalidConfig": plural({
    one: "The saved value of {fields} doesn't fit this version. Choose a new one under Settings to start it.",
    other:
      "The saved values of {fields} don't fit this version. Choose new ones under Settings to start it.",
  }),
  "plugins.reason.error":
    "It stopped and won't start again on its own. Check the log, then restart it.",
  "plugins.reason.missing":
    "Its folder is gone from the server. Put it back and look for folders again, or remove the plugin.",
  "plugins.reason.incompatible":
    "It was made for a different version of Matinee.",
  "plugins.reason.more": "Show all",
  "plugins.reason.less": "Show less",

  // A plugin that's on sleeps between calls, holding no memory, and wakes
  // when something needs it. Sleeping is its normal, healthy rest.
  "plugins.sleep.asleep": "Asleep",
  "plugins.sleep.awake": "Awake",
  "plugins.sleep.asleepTitle": "Running, asleep until something needs it",
  "plugins.sleep.awakeTitle": "Running, awake now",
  "plugins.sleep.reason":
    "It sleeps while nothing needs it and wakes in a moment when something does.",

  // How the events a plugin listens for get to it, on its page.
  "plugins.events.title": "Events",
  "plugins.events.delivered": "All delivered",
  "plugins.events.delivering": plural({
    one: "Delivering, {count} waiting",
    other: "Delivering, {count} waiting",
  }),
  "plugins.events.waiting": plural({
    one: "{count} waiting",
    other: "{count} waiting",
  }),
  "plugins.events.whileStopped":
    "They wait until it runs again, and each is dropped a day after it happened.",
  // Nothing gets through, so the server sends one event at a time.
  "plugins.events.blocked": "Not getting through",
  "plugins.events.blockedReason":
    "Every recent try failed, so Matinee treats the plugin as down. It sends one event at a time, waiting longer after each failure, and the rest follow once one gets through. The plugin said:",
  // Some events keep failing while the rest get through.
  "plugins.events.failing": plural({
    one: "{count} event keeps failing",
    other: "{count} events keep failing",
  }),
  "plugins.events.failingReason": plural({
    one: "The rest are getting through. Matinee tries this one again on its own, waiting longer after each failure, and drops it a day after it happened. The plugin said:",
    other:
      "The rest are getting through. Matinee tries these again on their own, waiting longer after each failure, and drops each a day after it happened. For the oldest, the plugin said:",
  }),
  // {when} is a relative time, like "in 23 hours".
  "plugins.events.dropAt": "Dropped {when}",
  "plugins.events.tries": plural({
    one: "Tried once",
    other: "Tried {count} times",
  }),
  "plugins.events.retry": "Try now",
  "plugins.events.retryFailed": "Couldn't try again",
  // {when} is a relative time, like "in 25 seconds" or "in 10 minutes".
  "plugins.events.nextTry": "Next try {when}",
  "plugins.events.tryingNow": "Trying again now",
  "plugins.events.showLog": "See each try in the log",

  // What turning a plugin off, or removing it, takes away. {providers} is
  // a list of its sign-in names.
  "plugins.impact.checking": "Checking what it affects",
  "plugins.impact.unknown": "Couldn't check what it affects.",
  "plugins.impact.lockedOut": plural({
    one: "{count} person will be locked out",
    other: "{count} people will be locked out",
  }),
  // The last entry in a list of usernames: "ada, ben, and 2 others".
  "plugins.impact.others": plural({
    one: "{count} other",
    other: "{count} others",
  }),
  "plugins.impact.lockedOut.off":
    "{providers} is their only way to sign in. They can sign in again once it's back on.",
  "plugins.impact.lockedOut.remove":
    "{providers} is their only way to sign in. After this they have none.",
  "plugins.impact.linked": plural({
    one: "{count} account signs in with {providers}",
    other: "{count} accounts sign in with {providers}",
  }),
  "plugins.impact.linked.off": plural({
    one: "The link stays and works again once it's back on.",
    other: "Their links stay and work again once it's back on.",
  }),
  "plugins.impact.linked.remove": plural({
    one: "The link is deleted for good.",
    other: "Their links are deleted for good.",
  }),
  "plugins.impact.libraries": plural({
    one: "{count} library gets its metadata from it",
    other: "{count} libraries get their metadata from it",
  }),
  "plugins.impact.librariesMore": plural({
    one: "and {count} more",
    other: "and {count} more",
  }),
  "plugins.impact.libraries.off": plural({
    one: "It keeps what it has and fetches nothing new until it's back on.",
    other: "They keep what they have and fetch nothing new until it's back on.",
  }),
  "plugins.impact.libraries.remove": plural({
    one: "It keeps what it has. Pick another metadata source for it under Libraries.",
    other:
      "They keep what they have. Pick another metadata source for them under Libraries.",
  }),

  // Turning off a plugin that takes something away.
  "plugins.off.title": "Turn off {name}?",
  "plugins.off.description":
    "Its settings and data stay. This is what changes until you turn it on again.",
  "plugins.off.generic.signIns":
    "Nobody can sign in with {providers} while it's off, and anyone with no other way in is locked out.",
  "plugins.off.generic.metadata":
    "Libraries that use it fetch no new metadata while it's off.",
  "plugins.off.confirm": "Turn off",

  // Approving a plugin, on its page.
  "plugins.approval.title": "Waiting for your approval",
  "plugins.approval.fresh": "It won't run until you approve what it asks for.",
  "plugins.approval.more":
    "This version asks for more than you approved. It stays stopped until you approve the new permissions.",
  "plugins.approval.changedOnDisk":
    "Its files on the server changed since you approved it. It asks for nothing new, but the code that runs is different. Approve it if you expected the change.",
  "plugins.approval.approve": "Approve",
  "plugins.approval.approveAndEnable": "Approve and turn on",
  "plugins.approval.done": "Approved {name}",
  "plugins.approval.failed": "Couldn't approve {name}",

  // Permissions, as sentences. Lists of names fill the placeholders.
  // A setting's name, quoted, as a permission names it.
  "plugins.quoted": "“{text}”",
  "plugins.permission.network":
    "Connect to these hosts on the internet, and no others",
  "plugins.permission.network-config":
    "Connect to the address you enter under {settings}, which can be on your own network",
  "plugins.permission.storage":
    "Keep a small amount of its own data on this server",
  "plugins.permission.metadata":
    "Provide titles, descriptions, and artwork as {providers}, for libraries you set to use it",
  "plugins.permission.auth":
    "Sign people in with {providers}. It can sign in to any account linked to it, and to no other",
  "plugins.permission.auth-credentials":
    "See what people type into the {providers} sign-in form, passwords included",
  "plugins.permission.events-library":
    "See when libraries are scanned and titles are added",
  "plugins.permission.events-playback": "See who plays what, and when",
  "plugins.permission.events-users": "See when accounts are created",
  "plugins.sensitive.label": "Sensitive.",
  "plugins.sensitive.credentials":
    "Passwords pass through it. Only allow this for a plugin whose author you trust.",
  "plugins.sensitive.playback":
    "This is everyone's watch history on this server, as it happens.",
  "plugins.permissions.new": "New in this version",
  "plugins.permissions.newBadge": "New",
  "plugins.permissions.kept": "Already allowed",
  "plugins.permissions.none": "It asks for nothing beyond running.",
  "plugins.permissions.sandbox":
    "Whatever it asks for, a plugin runs in a sandbox. It can't read the database, see sessions or other plugins' data, reach hosts it didn't list, or open files on the server.",

  // A plugin's settings, made from the fields it declares.
  "plugins.config.required": "(required)",
  "plugins.config.fromEnvironment": "Set by the server's environment",
  "plugins.config.environmentNote":
    "The server's environment sets this. A value here overrides it.",
  "plugins.config.networkNote":
    "The plugin may connect to this address, even on your own network.",
  "plugins.config.notSet": "Not set",
  "plugins.config.secretSaved": "Saved. Type to replace it.",
  "plugins.config.secretNone": "Not set",
  "plugins.config.secretRemove": "Remove {field}",
  "plugins.config.secretKeep": "Keep it",
  "plugins.config.secretRemoved": "Removed when you save.",
  "plugins.config.notNumber": "Enter a number.",
  "plugins.config.atLeast": "Enter {min} or more.",
  "plugins.config.atMost": "Enter {max} or less.",
  "plugins.config.notUrl": "Enter a full address, like https://example.com.",
  "plugins.config.checkField": "Check {field}: {issue}",
  // A saved value the plugin's current version no longer takes.
  "plugins.config.invalid": "The saved value doesn't fit this version.",
  "plugins.config.invalidValue":
    "The saved value, {value}, doesn't fit this version.",
  "plugins.config.invalidSelect": "Pick one of its choices.",
  "plugins.config.invalidOther": "Enter a new value.",

  // Saving a change to a setting that decides who a sign-in belongs to,
  // like the address of the service, while accounts are linked to it.
  // {settings} is a list of setting names, {providers} of sign-in names.
  "plugins.links.title": "Change where people sign in?",
  "plugins.links.changed": plural({
    one: "You changed {settings}, and {count} account signs in with {providers}.",
    other:
      "You changed {settings}, and {count} accounts sign in with {providers}.",
  }),
  "plugins.links.changedUnknown":
    "You changed {settings}. Couldn't check how many accounts sign in with {providers}.",
  "plugins.links.why":
    "Each link ties an account here to a name the service gives. After this change, the same name can stand for someone else, like a user of that name on another server, and that person would get into the account.",
  "plugins.links.choice":
    "Keep the links if it's the same service with the same people, such as a new address for the same server. Otherwise remove them, and people link {providers} again in their account settings.",
  "plugins.links.lockedOut":
    "{providers} is their only way to sign in. If you remove the links, they have none.",
  "plugins.links.keepAction": "Keep links",
  "plugins.links.removeAction": "Remove links",

  // Sign-in a plugin provides.
  "plugins.signIn.allowSignUp":
    "Let new people create an account with {provider}",
  "plugins.signIn.allowSignUpHint":
    "Someone without an account here gets one, as a user. While this is off, {provider} only signs in people who linked it in their account settings.",
  "plugins.signIn.failed": "Couldn't change sign-up",

  // Updating.
  "plugins.update.check": "Check for updates",
  "plugins.update.checkFailed": "Couldn't check for updates",
  "plugins.update.available": "{name} {version} is available",
  "plugins.update.availableCount": plural({
    one: "{count} update available",
    other: "{count} updates available",
  }),
  "plugins.update.none": "{name} is up to date",
  "plugins.update.noneAll": "Every plugin from npm is up to date",
  "plugins.update.to": "Update to {version}",
  "plugins.update.reading": "Reading {version}",
  "plugins.update.readFailed": "Couldn't read the update to {name}",

  // Removing.
  "plugins.remove": "Remove plugin",
  "plugins.remove.title": "Remove {name}?",
  "plugins.remove.description":
    "Its files, its settings, and the data it stored on this server go with it.",
  "plugins.remove.withSignIns":
    "Its files, its settings, the data it stored on this server, and the {providers} sign-ins people linked go with it.",
  "plugins.remove.metadata":
    "Libraries that use it keep the metadata they have.",
  "plugins.remove.confirm": "Remove",
  "plugins.removed": "Removed {name}",
  "plugins.removeFailed": "Couldn't remove {name}",

  // The log.
  "plugins.log.label": "Recent log",
  "plugins.log.empty": "Nothing logged yet.",
  "plugins.log.loadFailed": "Couldn't load the log. {error}",
  "plugins.log.level.debug": "debug",
  "plugins.log.level.info": "info",
  "plugins.log.level.warn": "warn",
  "plugins.log.level.error": "error",

  // Adding a plugin.
  "plugins.add.title": "Add a plugin",
  "plugins.add.description":
    "Nothing is installed until you've seen what it asks for.",
  "plugins.add.source": "Package or address",
  "plugins.add.sourceHint":
    "A package name like matinee-plugin-anilist, with @version if you want one, or an https address.",
  "plugins.add.badName": "That isn't a package name. Check it on npm.",
  "plugins.add.badUrl": "Use an https address to a .tgz file.",
  "plugins.add.reading": "Downloading it and reading what it asks for",
  "plugins.add.cancelReading": "Cancel",
  "plugins.add.continue": "Continue",
  "plugins.add.browse": "Plugins on npm",
  "plugins.add.resultsFor": "On npm for “{query}”",
  "plugins.add.strangers":
    "Anyone can publish to npm, and these are packages people tagged for Matinee. The next step shows what one asks for.",
  "plugins.add.noResults": "Nothing on npm matches “{query}”.",
  "plugins.add.noneTagged": "No packages on npm are tagged for Matinee yet.",
  "plugins.add.searchFailed": "Couldn't search npm. {error}",
  "plugins.add.installed": "Installed",

  // The consent step, before installing or updating.
  "plugins.consent.installTitle": "Install {name}?",
  "plugins.consent.updateTitle": "Update {name} to {version}?",
  "plugins.consent.versionChange": "Version {from} to {to}",
  "plugins.consent.asks": "What it asks to do",
  "plugins.consent.asksMore": "This version asks for more",
  "plugins.consent.asksNothingNew": "This version asks for nothing new",
  "plugins.consent.enableHint":
    "Left off, it installs but doesn't run until you turn it on.",
  "plugins.consent.back": "Back",
  "plugins.consent.cancel": "Cancel",
  "plugins.consent.installOff": "Install, leave off",
  "plugins.consent.installOn": "Install and turn on",
  "plugins.consent.update": "Update to {version}",
  "plugins.consent.installed": "Installed {name}",
  "plugins.consent.updated": "Updated {name} to {version}",
  "plugins.consent.installFailed": "Couldn't install {name}",
  "plugins.consent.updateFailed": "Couldn't update {name}",
  "plugins.consent.close": "Close",
})
