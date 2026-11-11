import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@matinee/ui/components/alert"
import { CircleAlertIcon } from "lucide-react"

/**
 * An error that stays because it holds the page or form back, such as data
 * that didn't load, with an optional next step. A failed action gets a
 * toast instead.
 */
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
