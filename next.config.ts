import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin();

// Docker: standalone mode (supports API routes)
// Static deployment: export mode (uses remote API)
const isDocker = process.env.DOCKER_BUILD === "true";

const nextConfig: NextConfig = {
  output: isDocker ? "standalone" : "export",
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "unknown",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ["antd", "@ant-design/icons"],
  },
};

export default withNextIntl(nextConfig);
