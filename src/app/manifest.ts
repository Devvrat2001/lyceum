import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes Lyceum installable as a PWA. Next serves this
 * at `/manifest.webmanifest` and auto-injects `<link rel="manifest">`
 * into every page's <head>.
 *
 * Brand colours mirror the design tokens in globals.css: theme (browser
 * UI tint) = ink `--wf-ink`, splash background = canvas `--wf-bg`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lyceum — Personalized K-12 Learning",
    short_name: "Lyceum",
    description:
      "Adaptive learning paths, an AI tutor on every lesson, gamified XP & streaks, and a teacher marketplace.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fbfaf5",
    theme_color: "#1f1d1a",
    categories: ["education"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
