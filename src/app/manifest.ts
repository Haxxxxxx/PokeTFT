import type { MetadataRoute } from "next";

/**
 * Web app manifest — what makes the game installable.
 *
 * This is the whole iOS story. Apple does not allow an app to be installed
 * from a website: there is no equivalent of the Android .apk the download page
 * offers. Off-store distribution means TestFlight (builds expire after 90 days
 * and external testing needs review) or ad-hoc (every device's UDID registered
 * by hand, 100 a year). Neither is something a player can act on from a link.
 *
 * Add to Home Screen is. With `display: standalone` and the Apple meta tags in
 * layout.tsx, the game launches with no URL bar and no browser toolbar — which
 * is the thing the broken fullscreen button was being asked for. It is not a
 * consolation prize on iOS; it is the only route there is, and it costs the
 * player two taps.
 *
 * `export const dynamic = "force-static"` is required: the app is a static
 * export (next.config.ts sets output: "export"), and a manifest route without
 * it is treated as dynamic and fails the build.
 */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PokéTFT",
    short_name: "PokéTFT",
    description: "Build a team of Pokémon, activate type synergies, and battle up to 8 trainers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#0a0e1a",
    theme_color: "#0a0e1a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops a maskable icon to a circle, so this one keeps the ball
      // inside the middle 80% — the "any" icons would lose their rim.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
