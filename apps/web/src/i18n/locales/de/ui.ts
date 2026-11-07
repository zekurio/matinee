import type { TranslationOf } from "../../catalog"
import type source from "../en/ui"

export default {
  "ui.close": "Schließen",
  "ui.loading": "Wird geladen",
  "ui.notifications": "Benachrichtigungen",
  "ui.closeToast": "Benachrichtigung schließen",
  "ui.pickColor": "Farbe für {label} wählen",
  "ui.colorArea": "{label}: Sättigung und Helligkeit",
  "ui.colorHue": "{label}: Farbton",
  "ui.colorHex": "{label}: Hex-Wert",
  "ui.previousMonth": "Zum vorherigen Monat",
  "ui.nextMonth": "Zum nächsten Monat",
  "ui.today": "Heute, {date}",
  "ui.selected": "{date}, ausgewählt",
  "ui.lightVariant": "Hell",
  "ui.darkVariant": "Dunkel",
  "ui.numberedVariant": "{name} {number}",
  "ui.themeFile.inFile": "{file}: {reason}",
  "ui.themeFile.importedTheme": "Importiertes Design",
  "ui.themeFile.tooLarge": "Designdateien dürfen höchstens 256 KB groß sein.",
  "ui.themeFile.invalidJson": "Das ist kein gültiges JSON.",
  "ui.themeFile.notAnObject": "Erwartet wurde ein Design-Objekt.",
  "ui.themeFile.unknownFormat":
    "Erwartet wurde ein Matinee- oder VS-Code-Design.",
  "ui.themeFile.unsupportedVersion":
    "Diese Version der Designdatei wird nicht unterstützt.",
  "ui.themeFile.nameLength":
    "Ein Design braucht einen Namen mit 1 bis {max} Zeichen.",
  "ui.themeFile.noVariants": "Ein Design braucht helle oder dunkle Farben.",
  "ui.themeFile.tooManyVariants":
    "Ein Design kann höchstens {max} Varianten haben.",
  "ui.themeFile.notAList": "Erwartet wurde eine Liste von Varianten.",
  "ui.themeFile.variantAppearance":
    "Die Darstellung einer Variante muss „light“ oder „dark“ sein.",
  "ui.themeFile.lightNotAnObject": "Die hellen Farben müssen ein Objekt sein.",
  "ui.themeFile.darkNotAnObject": "Die dunklen Farben müssen ein Objekt sein.",
  "ui.themeFile.notAColor": "„{value}“ ist keine Farbe.",
  "ui.themeFile.unknownColor": "Unbekannte Designfarbe „{key}“.",
  "ui.themeFile.noEditorBackground":
    "Dieses VS-Code-Design legt keinen Editor-Hintergrund fest.",
} satisfies TranslationOf<typeof source>
