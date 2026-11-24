/** A page the React app has and this one doesn't yet. */
export function NotPorted(props: { page: string }) {
  return (
    <div class="text-muted-foreground flex min-h-[50dvh] flex-col items-center justify-center gap-1 text-sm">
      <p class="text-foreground text-base font-medium">{props.page}</p>
      <p>Not ported to Solid yet.</p>
    </div>
  )
}
