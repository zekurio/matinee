import { defineMessages, plural } from "../../catalog"

export default defineMessages("access", {
  // What a group or an account allows, as rows and dialogs show it.
  // The built-in group that holds every account.
  "access.everyone": "Everyone",
  "access.libraries": "Libraries",
  "access.libraries.all": "All libraries",
  "access.libraries.picked": "Picked libraries",
  "access.libraries.none": "No libraries",
  "access.libraries.count": plural({
    one: "{count} library",
    other: "{count} libraries",
  }),
  "access.libraries.allHint": "Includes libraries added later.",
  "access.libraries.noneOnServer": "There are no libraries yet.",
  "access.bitrate": "Bit rate limit",
  "access.bitrate.none": "No bit rate limit",
  // {rate} like 8 Mbps.
  "access.bitrate.upTo": "Up to {rate}",
  "access.bitrate.hint":
    "A file over the limit streams as an encode under it. Downloads aren't limited.",
  "access.transcode": "Video encoding",
  "access.transcode.on": "Encodes video",
  "access.transcode.off": "No video encoding",
  "access.transcode.hint":
    "The server may encode video to fit the limit or a device. Off, a file plays as it is or with its video copied, and one that needs an encode doesn't play.",
  "access.downloads": "Downloads",
  "access.downloads.on": "Can download",
  "access.downloads.off": "No downloads",
  "access.downloads.hint": "Files as they are, and versions made for a device.",
  "access.streams": "Simultaneous streams",
  "access.streams.none": "Any number of devices",
  "access.streams.count": plural({
    one: "{count} device at once",
    other: "{count} devices at once",
  }),
  "access.requests": "Requests",
  "access.requests.off": "Off",
  "access.requests.ask": "Needs approval",
  "access.requests.add": "Add right away",
  "access.requests.factOff": "No requests",
  "access.requests.factAsk": "Requests need approval",
  "access.requests.factAdd": "Requests added right away",
  // {requests} like "Requests need approval", {limit} like "5 titles every 7 days".
  "access.requests.factLimited": "{requests}, {limit}",
  "access.requestLimit": "Limit",
  "access.requestLimit.none": "No limit",
  "access.requestLimit.some": "Limited",
  "access.requestLimit.titles": plural({
    one: "{count} title",
    other: "{count} titles",
  }),
  "access.requestLimit.period": plural({
    one: "a day",
    other: "every {count} days",
  }),
  // {titles} like "5 titles", {period} like "every 7 days".
  "access.requestLimit.rate": "{titles} {period}",
  "access.requestLimit.titlesField": "Titles",
  "access.requestLimit.daysField": "Days",
  // Between the two numbers: [5] titles every [7] days.
  "access.requestLimit.titlesEvery": "titles every",
  "access.requestLimit.days": "days",
  // What a group or an account allows, by part of the editor.
  "access.section.watching": "Watching",
  "access.section.requests": "Requests",
  "access.section.api": "API",
  "access.section.server": "Running the server",
  "access.section.serverHint":
    "Parts of running the server that members take on. View lets them look, Manage lets them change it too.",
  "access.apiTokens": "API tokens",
  "access.apiTokens.on": "Can make API tokens",
  "access.apiTokens.hint":
    "Tokens for scripts and services that use the API as the account.",
  // The parts of running the server, and what each covers.
  "access.area.requests": "Request queue",
  "access.area.requests.hint":
    "Everyone's requests: approving, declining, retrying.",
  "access.area.connections": "Connections",
  "access.area.connections.hint":
    "Radarr, Sonarr, and the rules that send requests to them.",
  "access.area.libraries": "Libraries",
  "access.area.libraries.hint":
    "Adding, changing, scanning, and deleting libraries.",
  "access.area.metadata": "Metadata",
  "access.area.metadata.hint":
    "Fixing matches, refreshing metadata, and images.",
  "access.area.users": "Users and groups",
  "access.area.users.hint":
    "Accounts, access groups, invites, and who's watching.",
  "access.area.server": "Server settings",
  "access.area.server.hint":
    "Transcoding, trickplay, network, branding, and the jobs.",
  "access.level.none": "None",
  "access.level.view": "View",
  "access.level.manage": "Manage",
  "access.level.on": "On",
  "access.level.off": "Off",
  // A fact on a group or an account: how many parts it hands on.
  "access.manages.count": plural({
    one: "Runs {count} part of the server",
    other: "Runs {count} parts of the server",
  }),
  // {area} like "Request queue", {level} like "Manage".
  "access.manages.area": "{area}: {level}",
  "access.done": "Done",
  "access.retry": "Try again",

  // Permissions: what an API token may do. They show as the API names
  // them, like library.scan, under each resource's line.
  "access.permissions.search": "Search permissions",
  "access.permissions.noMatch": "No permission matches.",
  "access.permissions.all": "Every permission",
  "access.permissions.allHint": "Admins can do everything.",
  // When the person editing lacks some of them.
  "access.permissions.ownOnly":
    "You can only grant or take away permissions you have yourself.",
  "access.permission.account":
    "The account's profile, picture, and preferences.",
  "access.permission.adminApiToken": "Revoking other accounts' API tokens.",
  "access.permission.adminRequest":
    "Everyone's requests: the queue, approving, declining, and retrying.",
  "access.permission.adminSession": "Signing other accounts out.",
  "access.permission.adminUser":
    "Other accounts: the list, their groups and access, and deleting them.",
  "access.permission.apiToken": "The account's API tokens.",
  "access.permission.authSettings": "Passkey and single sign-on settings.",
  "access.permission.branding": "The server's name and login page.",
  "access.permission.catalog":
    "Discover, and the catalog of titles to ask for.",
  "access.permission.favorite": "Favorites.",
  "access.permission.folder":
    "Browsing the server's folders, as adding a library does.",
  "access.permission.fulfilment":
    "Connections that fetch requested titles, and their rules.",
  "access.permission.group": "Access groups.",
  "access.permission.invite": "Invite links.",
  "access.permission.job": "Queues and scheduled tasks.",
  "access.permission.library":
    "Libraries and their folders. Scanning also refreshes metadata.",
  "access.permission.media":
    "Files: their details, playing them, and downloading them.",
  "access.permission.networkSettings": "Network settings.",
  "access.permission.oidcAccount": "The account's single sign-on link.",
  "access.permission.party": "Watch parties.",
  "access.permission.passkey": "The account's passkeys.",
  "access.permission.profile": "Other people's profiles.",
  "access.permission.recommendation": "Recommendations.",
  "access.permission.request":
    "The account's own requests. With autoApprove they're added without an approval.",
  "access.permission.serverSetup": "Finishing the server's setup.",
  "access.permission.serverStats":
    "Everyone's watch time, and who is watching now.",
  "access.permission.session":
    "The account's sessions, and approving a device's sign-in.",
  "access.permission.stats":
    "The account's own statistics, and the leaderboard.",
  "access.permission.title":
    "Titles, people, search, and artwork. Updating fixes matches and images.",
  "access.permission.transcodingSettings": "Transcoding settings.",
  "access.permission.trickplaySettings": "Trickplay settings.",
  "access.permission.watchState":
    "Progress, watched marks, Continue Watching, and Next Up.",

  // Settings → Access: the list of groups.
  "access.groups.title": "Access groups",
  "access.groups.create": "New group",
  "access.groups.intro":
    "An account gets the most its groups allow. Settings under Users override groups. Admins have no limits and can do everything.",
  "access.groups.loadFailed": "Couldn't load the groups. {error}",
  "access.groups.onlyEveryone":
    "Every account is in Everyone. Add groups to give some accounts more.",
  "access.group.everyAccount": "Every account",
  "access.group.members": plural({
    one: "{count} member",
    other: "{count} members",
  }),
  // {group} is a group's name at the OIDC provider.
  "access.group.follows": "Follows {group} at the provider",
  "access.group.actions": "Actions for {name}",
  "access.group.edit": "Edit",
  "access.group.delete": "Delete group",
  "access.group.deleted": "Deleted {name}",
  "access.group.deleteTitle": "Delete {name}?",
  "access.group.deleteDescription": plural({
    one: "Its {count} member loses what only this group allowed. The account stays.",
    other:
      "Its {count} members lose what only this group allowed. Their accounts stay.",
  }),
  "access.group.deleteDescriptionEmpty": "Nobody is in it.",

  // Making or editing a group.
  "access.group.newTitle": "New group",
  "access.group.editTitle": "Edit {name}",
  "access.group.description": "Members get the most their groups allow.",
  "access.group.everyoneDescription":
    "Every account is in this group. Take its libraries away to make access opt-in, then open them through other groups. Its limits then count only for accounts no group opens anything for.",
  "access.group.name": "Name",
  "access.group.namePlaceholder": "Family",
  "access.group.providerGroup": "Provider group",
  "access.group.providerGroupPlaceholder": "None",
  "access.group.providerGroupHint":
    "Accounts in this provider group join at sign-in and leave when removed there.",
  "access.group.providerGroupHintNoClaim":
    "No provider groups yet. Set the groups claim under Settings → Authentication.",
  // How many linked accounts the provider has in a group it sent.
  "access.group.providerAccounts": plural({
    one: "{count} account",
    other: "{count} accounts",
  }),
  "access.group.checkFields": "Check the fields.",
  "access.group.save": "Save",
  "access.group.create": "Create group",

  // One account's access, from its menu under Settings → Users.
  "access.user.title": "Access for {name}",
  "access.user.description":
    "An account gets the most its groups allow. Settings here override them.",
  "access.user.gets": "What {name} gets",
  "access.user.getsAfterSave": "Save to see what your changes give.",
  // Stands in for the provider's name while single sign-on is off.
  "access.user.theProvider": "the sign-in provider",
  // {when} is relative, like "2 hours ago".
  "access.user.claimsSynced":
    "Last read groups and claims from {provider} {when}.",
  "access.user.claimsNever":
    "No claims read from {provider} yet. They're read at the next sign-in.",
  "access.user.groups": "Groups",
  "access.user.everyoneHint": "Every account is in it.",
  "access.user.groupFromProvider":
    "The groups claim from {provider} put this account here. Only {provider} can take it out, at the next sign-in.",
  "access.user.groupFollows":
    "Also holds the accounts {provider} lists in {group}.",
  "access.user.noGroups":
    "There are no other groups yet. Make one under Settings → Access.",
  "access.user.override": "Set on this account",
  "access.user.overrideHint":
    "From groups leaves a setting to the groups. Anything else wins over them.",
  "access.user.overrideFromProvider":
    "The policy claim from {provider} sets these at each sign-in. A change here lasts only until {name} signs in again.",
  "access.user.fromGroups": "From groups",
  // {value} is what the groups give, like "Up to 8 Mbps" or "Allowed".
  "access.user.fromGroupsValue": "From groups ({value})",
  "access.user.allowed": "Allowed",
  "access.user.notAllowed": "Not allowed",
  "access.user.checkFields": "Check the fields.",
  "access.user.save": "Save",
  "access.user.saving": "Saving…",
  "access.user.saved": "Saved",
  "access.user.retry": "Try again",
  "access.user.goneTitle": "User not found",
  "access.user.gone": "That user no longer exists.",
})
