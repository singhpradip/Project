import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to the monorepo root (this file lives in boardstack-web/,
  // so ".." is ~/Documents/Project). Silences the "inferred workspace root" warning
  // caused by a stray package-lock.json in the home directory.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
