import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Styled text input defaulting to `type="text"`. Passes all native `<input>`
 * props through, including `name` for use in Server Action forms.
 *
 * @example
 * <Input name="title" placeholder="e.g. One Piece" required />
 * <Input type="email" name="email" placeholder="you@example.com" />
 * <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
 */
function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
