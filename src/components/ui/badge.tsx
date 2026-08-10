import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Small status pill: aspect ratio, slide count, tags. */
const badge = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-foreground text-background",
        secondary: "border-transparent bg-muted text-muted-foreground",
        accent: "border-transparent bg-accent text-accent-foreground",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badge>;

export function Badge({ className, variant, ...rest }: BadgeProps) {
  return <span className={cn(badge({ variant }), className)} {...rest} />;
}

export { badge as badgeVariants };
