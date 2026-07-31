import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 uses Turbopack by default.
  // An empty turbopack config satisfies the build requirement.
  // pdfjs-dist canvas peer dependency is optional and doesn't need
  // special bundler config — it simply won't render canvas-based pages.
  turbopack: {},
};

export default nextConfig;
