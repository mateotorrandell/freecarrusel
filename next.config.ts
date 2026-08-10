import type { NextConfig } from "next";

/**
 * Two things matter here.
 *
 * `serverExternalPackages` keeps the native modules out of the bundler: sharp,
 * archiver and puppeteer load platform-specific binaries at runtime and break
 * if they are traced and rewritten.
 *
 * The CSP is the second half of the sandbox around slide markup. Slides are
 * user- and AI-generated HTML rendered in an iframe; the iframe's sandbox
 * attribute stops scripts from reaching anything, and this header stops the app
 * itself from talking to hosts it has no business talking to. Google Fonts is
 * the only third party on the list, and only for stylesheets and font files.
 */
const config: NextConfig = {
  serverExternalPackages: ["sharp", "archiver", "puppeteer"],

  async headers() {
    const policy = [
      "default-src 'self'",
      // Next's dev runtime needs both, in production only 'unsafe-inline'.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // Slides embed their images as data: and blob: while editing.
      "img-src 'self' data: blob: https:",
      "frame-src 'self' blob:",
      "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ");

    return [{ source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: policy }] }];
  },
};

export default config;
