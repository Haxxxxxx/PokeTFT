import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully client-side app → static export, deployed to Firebase Hosting (free, no SSR/functions).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
