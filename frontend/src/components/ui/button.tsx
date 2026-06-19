import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-ink-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none gap-1.5",
  {
    variants: {
      variant: {
        default: "border border-line bg-paper-50 text-ink-900 hover:bg-paper-200 active:bg-paper-300",
        primary: "border-ink-900 bg-ink-900 text-paper-50 hover:bg-ink-800 hover:border-ink-800",
        ghost: "border-transparent bg-transparent text-ink-500 hover:text-ink-900 hover:bg-paper-200",
        destructive: "border-line bg-paper-50 text-err hover:bg-err hover:text-paper-50 hover:border-err",
        accent: "border-accent bg-accent text-paper-50 hover:bg-accent-deep hover:border-accent-deep",
      },
      size: {
        default: "h-7 px-3 rounded-sm",
        sm: "h-6 px-2 text-xs rounded-sm",
        lg: "h-8 px-4 rounded-sm",
        icon: "h-7 w-7",
        xs: "h-5 px-1.5 text-2xs rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
