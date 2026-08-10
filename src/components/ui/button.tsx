import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  [
    "oc-press inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-lg text-sm font-medium cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/90",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90",
        outline: "border border-border bg-transparent text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & {
    /** Render the child element instead of a <button>, keeping the styles. */
    asChild?: boolean;
    ref?: React.Ref<HTMLButtonElement>;
  };

export function Button({ className, variant, size, asChild, ...rest }: ButtonProps) {
  const Element = asChild ? Slot : "button";
  return <Element className={cn(button({ variant, size }), className)} {...rest} />;
}

export { button as buttonVariants };
