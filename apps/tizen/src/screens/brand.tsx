import logo from "../../../../brand/logo-dark.svg"

/*
 * The logo and the mark, in their colors for dark backgrounds. The mark's
 * path and stops are brand/mark.svg's; see brand/README.md before
 * changing them.
 */

/** The logo, the sunset mark and the wordmark, `height` units tall. */
export function Logo(props: { height: number }) {
  return (
    <img src={logo} alt="Matinee" style={{ height: `${props.height}rem` }} />
  )
}

/** The mark alone, `size` units across. */
export function LogoMark(props: { size: number }) {
  const size = `${props.size}rem`
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <linearGradient
        id="matinee-sunset"
        x1="0"
        y1="3"
        x2="0"
        y2="20.7"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#ffc56b" offset="0" />
        <stop stop-color="#f27a8f" offset="0.5" />
        <stop stop-color="#6d8cf5" offset="1" />
      </linearGradient>
      <path
        fill="url(#matinee-sunset)"
        d="M2.22 15.1A10 10 0 1 1 21.78 15.1ZM2.53 16.2H21.47A10 10 0 0 1 20.77 17.8H3.23A10 10 0 0 1 2.53 16.2ZM4.15 19.2H19.85A10 10 0 0 1 18.38 20.7H5.62A10 10 0 0 1 4.15 19.2Z"
      />
    </svg>
  )
}
