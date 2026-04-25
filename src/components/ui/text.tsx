import * as React from "react"
import { cn } from "@/lib/utils"

export type TextVariant = "h1" | "h2" | "h3" | "h4" | "body" | "faint" | "label"

const variantStyles: Record<TextVariant, string> = {
  h1: "text-3xl font-bold",
  h2: "text-xl font-semibold",
  h3: "text-lg font-semibold",
  h4: "text-base font-semibold",
  body: "text-base text-gray-700",
  faint: "text-sm text-gray-400",
  label: "text-sm font-medium",
}

const variantElement: Record<TextVariant, React.ElementType> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  body: "p",
  faint: "p",
  label: "span",
}

type TextProps<C extends React.ElementType> = {
  variant: TextVariant
  as?: C
  muted?: boolean
  className?: string
  children?: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<C>, "className" | "children">

/**
 * Typography component that maps semantic variants to Tailwind classes and
 * their default HTML elements. Pass `muted` to override the color to gray-500
 * on any variant. Pass `as` to override the rendered element.
 *
 * @example
 * <Text variant="h1">Page title</Text>
 * <Text variant="h3">Section heading</Text>
 * <Text variant="body">Paragraph text in gray-700.</Text>
 * <Text variant="faint" muted>Secondary note in gray-500.</Text>
 * <Text as="label" variant="label" htmlFor="title">
 *   Title <span className="text-red-500">*</span>
 * </Text>
 */
function Text<C extends React.ElementType = React.ElementType>({
  variant,
  as,
  muted,
  className,
  children,
  ...props
}: TextProps<C>) {
  const Component = (as ?? variantElement[variant]) as React.ElementType
  return (
    <Component
      className={cn(variantStyles[variant], muted && "text-gray-500", className)}
      {...props}
    >
      {children}
    </Component>
  )
}

export { Text }
