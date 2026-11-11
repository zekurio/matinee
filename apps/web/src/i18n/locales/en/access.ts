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
  "access.streams.hint": "How many devices may play at the same time.",
  "access.cancel": "Cancel",
  "access.done": "Done",
  "access.retry": "Try again",

  // Settings → Access: the list of groups.
  "access.groups.title": "Access groups",
  "access.groups.create": "New group",
  "access.groups.intro":
    "An account gets the most generous of what its groups allow. What's set on an account under Users wins over its groups. Admins have no limits.",
  "access.groups.loadFailed": "Couldn't load the groups. {error}",
  "access.groups.onlyEveryone":
    "Every account is in Everyone. Make a group to give some accounts more than others.",
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
  "access.group.description":
    "Members get the most generous of what their groups allow.",
  "access.group.everyoneDescription":
    "Every account is in this group. Take its libraries away to make access opt-in, then open them through other groups.",
  "access.group.name": "Name",
  "access.group.namePlaceholder": "Family",
  "access.group.providerGroup": "Provider group",
  "access.group.providerGroupPlaceholder": "None",
  "access.group.providerGroupHint":
    "Accounts the provider lists in this group join it at each sign-in, and leave once it stops listing them. Leave it empty for a group only admins and invites fill.",
  "access.group.providerGroupHintNoClaim":
    "Accounts the provider lists in this group join it at each sign-in. No groups have come from the provider yet. They need the groups claim under Settings → Authentication.",
  // How many linked accounts the provider has in a group it sent.
  "access.group.providerAccounts": plural({
    one: "{count} account",
    other: "{count} accounts",
  }),
  "access.group.allows": "Members get",
  "access.group.checkFields": "Check the fields.",
  "access.group.save": "Save",
  "access.group.create": "Create group",

  // One account's access, from its menu under Settings → Users.
  "access.user.title": "Access for {name}",
  "access.user.description":
    "Groups give the most generous of what they allow. What's set here wins over the groups.",
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
