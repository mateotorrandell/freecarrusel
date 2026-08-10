/**
 * Strip executable content from slide HTML before it is stored.
 *
 * The preview iframe is `sandbox=""` and export runs through Puppeteer with the
 * same wrapper, so scripts were already inert there. Edit mode is the exception:
 * it runs the slide with `allow-scripts` to host the editing runtime. Sanitizing
 * on write keeps that mode from ever executing script that rode in with a slide.
 */
export function sanitizeSlideHtml(html: string): string {
  return (
    html
      // <script>…</script>, including unclosed trailing tags
      .replace(/<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, "")
      // inline handlers: onclick=… onerror=… (quoted or bare)
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
      // javascript: URLs in href/src/action
      .replace(
        /\s(href|src|action)\s*=\s*("|')?\s*javascript:[^"'>\s]*("|')?/gi,
        " $1=\"#\""
      )
      // <iframe>/<object>/<embed> — no reason for a slide to nest a browsing context
      .replace(/<\/?(iframe|object|embed)\b[^>]*>/gi, "")
  );
}
