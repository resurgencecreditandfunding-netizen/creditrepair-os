/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  // Short link for operator ads; query strings (campaign tags) carry over.
  async redirects() { return [{ source: "/pro", destination: "/partners", permanent: false }]; },
};
export default nextConfig;
