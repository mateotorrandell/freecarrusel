/**
 * freecarrusel identity.
 *
 * The mark is just the letter "f" in the accent colour — same typeface as the
 * rest of the UI, so it stays consistent at any size and there's no asset to
 * load. `src/app/icon.svg` draws the same letter for the browser tab.
 */

/** The mark on its own: the collapsed form of the wordmark. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center font-bold leading-none text-accent select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 1.1) }}
    >
      f
    </span>
  );
}

/** Full wordmark, for the expanded rail. */
export function LogoLockup() {
  return (
    <span className="text-sm font-bold tracking-tight text-foreground select-none">
      <span className="text-accent">f</span>ree
      <span className="text-accent">carrusel</span>
    </span>
  );
}
