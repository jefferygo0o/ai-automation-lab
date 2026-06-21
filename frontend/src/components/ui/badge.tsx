import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium font-mono tracking-tight transition-colors",
  {
    variants: {
      variant: {
        default: "border-line bg-paper-50 text-ink-700",
        muted: "border-line-soft bg-paper-100 text-ink-500",
        accent: "border-accent/30 bg-accent/10 text-accent-deep",
        ok: "border-ok/20 bg-ok/10 text-ok",
        warn: "border-warn/25 bg-warn/10 text-warn",
        err: "border-err/25 bg-err/10 text-err",
        info: "border-info/25 bg-info/10 text-info",
        outline: "border-line bg-transparent text-ink-700",
      },
      size: {
        default: "text-2xs px-2 py-0.5",
        sm: "text-[10px] px-1.5 py-px",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };