import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-brand-600 text-white",
        secondary: "bg-brand-50 text-brand-600 border-brand-300/40",
        outline: "border-border text-foreground",
        success: "bg-accent-50 text-accent-700 border-accent-300/40",
        danger: "bg-danger-50 text-danger-700 border-danger-300/40",
        warn: "bg-warn-50 text-warn-700 border-warn-300/40",
        info: "bg-brand-50 text-brand-600 border-brand-300/40",
        neutral: "bg-[var(--bg-muted)] text-[var(--text-muted)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
