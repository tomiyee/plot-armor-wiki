import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * A `flex` container div. Pass `col` to stack children vertically (`flex-col`).
 * Pass `flex` to set the CSS `flex` property as an inline style (e.g. `flex={1}`).
 * All other div props and className are forwarded and merged.
 *
 * @example
 * <Box className="gap-3 items-center">
 *   <Avatar />
 *   <Text>Username</Text>
 * </Box>
 *
 * <Box col className="gap-2">
 *   <Label htmlFor="name">Name</Label>
 *   <Input id="name" name="name" />
 * </Box>
 *
 * <Box col flex={1} className="gap-1">
 *   <Input name="search" />
 * </Box>
 */
function Box({
  col,
  flex,
  className,
  style,
  ...props
}: { col?: boolean; flex?: number | string } & React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex", col && "flex-col", className)}
      style={flex !== undefined ? { flex, ...style } : style}
      {...props}
    />
  )
}

export { Box }
