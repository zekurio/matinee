import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@matinee/ui/components/alert"
import { CircleAlertIcon } from "lucide-react"

/** An error above a form, with an optional next step. */
export function FormAlert({
  message,
  hint,
  className,
}: {
  message: string
  hint?: string
  className?: string
}) {
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon />
      <AlertTitle className="text-foreground">{message}</AlertTitle>
      {hint && <AlertDescription>{hint}</AlertDescription>}
    </Alert>
  )
}
