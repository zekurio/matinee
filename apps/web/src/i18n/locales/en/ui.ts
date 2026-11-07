import { defineMessages } from "../../catalog"

export default defineMessages("ui", {
  // Text the components in @matinee/ui show, handed over by lib/ui-text.ts.
  "ui.close": "Close",
  "ui.loading": "Loading",
  "ui.notifications": "Notifications",
  "ui.closeToast": "Close notification",
  "ui.pickColor": "Pick a color for {label}",
  "ui.colorArea": "{label} saturation and brightness",
  "ui.colorHue": "{label} hue",
  "ui.colorHex": "{label} hex value",
  // The calendar.
  "ui.previousMonth": "Go to the previous month",
  "ui.nextMonth": "Go to the next month",
  "ui.today": "Today, {date}",
  "ui.selected": "{date}, selected",
  // Custom theme variants without a name of their own.
  "ui.lightVariant": "Light",
  "ui.darkVariant": "Dark",
  "ui.numberedVariant": "{name} {number}",
  // Why a theme file didn't import.
  "ui.themeFile.inFile": "{file}: {reason}",
  "ui.themeFile.importedTheme": "Imported theme",
  "ui.themeFile.tooLarge": "Theme files can be at most 256 KB.",
  "ui.themeFile.invalidJson": "This isn't valid JSON.",
  "ui.themeFile.notAnObject": "Expected a theme object.",
  "ui.themeFile.unknownFormat": "Expected a Matinee or VS Code theme.",
  "ui.themeFile.unsupportedVersion": "Unsupported theme file version.",
  "ui.themeFile.nameLength": "A theme needs a name of 1 to {max} characters.",
  "ui.themeFile.noVariants": "A theme needs light or dark colors.",
  "ui.themeFile.tooManyVariants": "A theme can have at most {max} variants.",
  "ui.themeFile.notAList": "Expected a list of variants.",
  "ui.themeFile.variantAppearance":
    'A variant\'s appearance must be "light" or "dark".',
  "ui.themeFile.lightNotAnObject": "Expected light colors to be an object.",
  "ui.themeFile.darkNotAnObject": "Expected dark colors to be an object.",
  "ui.themeFile.notAColor": "“{value}” isn't a color.",
  "ui.themeFile.unknownColor": "Unknown theme color “{key}”.",
  "ui.themeFile.noEditorBackground":
    "This VS Code theme doesn't set an editor background.",
})
