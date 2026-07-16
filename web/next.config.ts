import type { NextConfig } from "next";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const basePath = configuredBasePath === "/"
  ? ""
  : configuredBasePath.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  basePath,
};

export default nextConfig;
