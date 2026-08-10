import { cn } from "@/lib/utils";

/**
 * Text field. Plain function component with a forwarded ref via props — React
 * 19 passes `ref` through like any other prop, so forwardRef is no longer
 * needed here.
 */
export function Input({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2",
        "text-sm text-foreground placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...rest}
    />
  );
}
