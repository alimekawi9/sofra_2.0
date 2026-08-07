/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.SOFRA_BUILD_DIST_DIR ? { distDir: process.env.SOFRA_BUILD_DIST_DIR } : {}),
};

export default nextConfig;
