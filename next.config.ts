import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, outputFileTracingIncludes: { "/command-center": ["./src/lib/command-center/center.html"] }, turbopack: { root: process.cwd() } };
export default config;
