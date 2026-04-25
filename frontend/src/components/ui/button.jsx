import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[color:var(--color-accent)] text-slate-950 hover:bg-amber-400",
        secondary: "bg-white/10 text-white hover:bg-white/15",
        ghost: "bg-transparent text-[color:var(--color-text-muted)] hover:bg-white/5 hover:text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Button({ className, variant, ...props }) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
