import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-brand-600 text-white hover:bg-brand-800 rounded-lg font-medium",
        primary: "bg-brand-600 text-white hover:bg-brand-800 rounded-lg font-medium",
        secondary: "border border-brand-600 text-brand-600 hover:bg-brand-50 rounded-lg",
        ghost: "text-[var(--text-muted)] hover:bg-[var(--bg-surface)] rounded-md",
        danger: "bg-danger-500 text-white hover:bg-danger-700 rounded-lg",
        outline: "border border-border bg-background hover:bg-muted hover:text-foreground rounded-lg",
        link: "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2.5 gap-2",
        sm: "h-8 px-4 py-2 text-xs gap-1.5",
        lg: "h-12 px-8 py-3 text-lg gap-2.5",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
