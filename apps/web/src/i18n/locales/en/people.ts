import { defineMessages, plural } from "../../catalog"

export default defineMessages("people", {
  // credits.tsx: what someone is credited as, by how many share it.
  "people.credit.creator": plural({ one: "Creator", other: "Creators" }),
  "people.credit.director": plural({ one: "Director", other: "Directors" }),
  "people.credit.writer": plural({ one: "Writer", other: "Writers" }),
  "people.credit.actor": plural({ one: "Actor", other: "Cast" }),
  "people.studio": plural({ one: "Studio", other: "Studios" }),
  // The last item in a list of names cut short, as in "A, B, C, and 2 more".
  "people.more": plural({ one: "{count} more", other: "{count} more" }),
  "people.cast": "Cast",

  // The person's page.
  "people.loadError": "Couldn't load {name}",
  "people.backHome": "Back to Home",
  "people.titleCount": plural({
    one: "{count} title",
    other: "{count} titles",
  }),
  // Headings over each kind of credit.
  "people.section.actor": "Acting",
  "people.section.creator": "Created",
  "people.section.director": "Directing",
  "people.section.writer": "Writing",
  // What TMDB says someone is known for.
  "people.department.acting": "Acting",
  "people.department.directing": "Directing",
  "people.department.writing": "Writing",
  "people.department.creator": "Creating",
  "people.department.production": "Production",
  "people.department.editing": "Editing",
  "people.department.camera": "Camera",
  "people.department.sound": "Sound",
  "people.department.art": "Art",
  "people.department.costume": "Costume & Make-Up",
  "people.department.visualEffects": "Visual Effects",
  "people.department.lighting": "Lighting",
  "people.department.crew": "Crew",
  "people.born": "Born {date}",
  "people.died": "Died {date}",
})
