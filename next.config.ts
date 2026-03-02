import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "yauzl-promise"],
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
};

export default nextConfig;
