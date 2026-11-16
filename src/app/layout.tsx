import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PokéTFT",
  description: "Auto-battler Pokémon style TFT",
  // Add to Home Screen is the ONLY route to a fullscreen game on iOS: Safari
  // on iPhone does not implement the Fullscreen API at all, and Apple does not
  // permit installing an app from a website. These tags are what make the
  // home-screen launch open without a URL bar or a browser toolbar, instead of
  // opening a plain Safari tab with a nicer icon.
  applicationName: "PokéTFT",
  appleWebApp: {
    capable: true,
    title: "PokéTFT",
    // "black", not "black-translucent". Translucent puts the clock and the
    // battery ON TOP of the page, which on this layout lands them over the
    // top HUD strip. Opaque costs a thin bar and keeps the HUD readable.
    statusBarStyle: "black",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  other: {
    // Next emits only the modern `mobile-web-app-capable`. iOS 15.4+ reads
    // `display: standalone` straight off the manifest, so that is enough on a
    // current iPhone — but older iOS keys on this legacy name and nothing
    // else, and it is the single tag that decides whether the home-screen
    // launch opens fullscreen or as a Safari tab with a nicer icon. One line
    // to cover the versions Next no longer emits for.
    "apple-mobile-web-app-capable": "yes",
  },
};

// Mobile hardening: lock zoom (the game is a fixed canvas that scales itself, so
// browser pinch/double-tap zoom only fights the drag-and-drop), fill the notch area,
// and keep the chrome dark. `interactiveWidget: resizes-content` keeps the layout
// stable when the on-screen keyboard opens (sign-in / username).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#0a0e1a",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overscroll-none">{children}</body>
    </html>
  );
}
