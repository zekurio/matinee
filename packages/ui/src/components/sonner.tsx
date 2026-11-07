import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Matinee has a single dark theme, so the toaster doesn't follow the system.
// The card itself is styled by .matinee-toast in globals.css.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="bottom-right"
      offset={24}
      gap={10}
      visibleToasts={5}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
        close: <XIcon className="size-3" strokeWidth={2.25} />,
      }}
      style={
        // SAFETY: These are CSS custom properties, which React passes through
        // to the element. CSSProperties only lists standard properties.
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-xl)",
          "--width": "380px",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "matinee-toast",
          title: "matinee-toast-title",
          description: "matinee-toast-description",
          icon: "matinee-toast-icon",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
export { toast } from "@matinee/ui/lib/toast"
