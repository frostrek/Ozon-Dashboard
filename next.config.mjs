/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "exceljs", "pdf-lib", "bwip-js", "pdf-parse", "translate-google"]
  }
};
export default nextConfig;
