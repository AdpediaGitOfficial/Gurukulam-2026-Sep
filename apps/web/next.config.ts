import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The contracts package ships TypeScript source for the browser bundle.
  transpilePackages: ["@gurukulam/contracts"],
  eslint: { ignoreDuringBuilds: true },
};

export default config;
