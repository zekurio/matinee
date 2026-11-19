// The system's light or dark scheme before the first paint, as src/main.tsx
// keeps it after. A file rather than an inline script, which the shell's
// Content-Security-Policy refuses.
try {
  document.documentElement.classList.add(
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  )
} catch {
  // Without matchMedia the theme's default, dark, stays.
}
