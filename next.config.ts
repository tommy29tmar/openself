import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "yauzl-promise", "@resvg/resvg-js"],
};

export default nextConfig;
