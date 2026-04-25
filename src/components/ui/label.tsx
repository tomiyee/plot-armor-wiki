import * as React from "react"
import { Text } from "@/components/ui/text"

/**
 * A `<label>` styled with the `label` text variant (`text-sm font-medium`).
 * Use `htmlFor` to associate it with an input by ID.
 *
 * @example
 * <Label htmlFor="title">
 *   Title <span className="text-red-500">*</span>
 * </Label>
 * <Input id="title" name="title" required />
 */
function Label({
  htmlFor,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"label">, "className"> & {
  className?: string
}) {
  return <Text as="label" variant="label" htmlFor={htmlFor} {...props} />
}

export { Label }
