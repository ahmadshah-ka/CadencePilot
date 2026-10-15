import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: { "/api/v1/workspaces/*/brands/*/ai/probe": ["./prompts/*.txt"] },
  reactStrictMode: true,
};

export default nextConfig;
