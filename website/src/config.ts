/**
 * Update these when you publish a GitHub Release.
 * Landing page download buttons point here.
 */
export const SITE = {
  productName: "Cohesive",
  tagline: "Local-first coding agent for your real projects",
  version: "0.2.0",
  /** Set this to your public GitHub repo URL before deploying the landing page. */
  githubUrl: "https://github.com/newVincentFong/cohesive",
  /** Prefer a Releases page until assets exist; swap to direct .dmg URLs later. */
  downloads: {
    appleSilicon: "https://github.com/newVincentFong/cohesive/releases/download/v0.2.0/Cohesive_0.2.0_aarch64.dmg",
    intel: "https://github.com/newVincentFong/cohesive/releases/download/v0.2.0/Cohesive_0.2.0_x64.dmg",
  },
} as const;
