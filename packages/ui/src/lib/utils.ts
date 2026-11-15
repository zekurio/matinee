import { createCn } from "cn/config"

/**
 * Joins class names and drops the ones a later class overrides. It's told
 * the font sizes `globals.css` adds to Tailwind's, since it would take
 * `text-13px` for a text color otherwise.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "9px",
            "10px",
            "11px",
            "13px",
            "15px",
            "22px",
            "26px",
            "28px",
            "32px",
          ],
        },
      ],
    },
  },
})
