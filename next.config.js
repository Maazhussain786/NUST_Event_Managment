/** @type {import('next').NextConfig} */
const accountName = process.env.AZURE_BLOB_ACCOUNT_NAME || "";
const cdnUrl = process.env.AZURE_BLOB_CDN_URL || "";

let cdnHostname = "";
try {
  cdnHostname = cdnUrl ? new URL(cdnUrl).hostname : "";
} catch {
  cdnHostname = "";
}

// Keep direct blob storage enabled even when a CDN URL is configured.
const blobHostname = accountName ? `${accountName}.blob.core.windows.net` : "";

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.blob.core.windows.net' },
      ...(blobHostname ? [{ protocol: 'https', hostname: blobHostname }] : []),
      ...(cdnHostname ? [{ protocol: 'https', hostname: cdnHostname }] : []),
    ],
  },
  // Required for file uploads > 4MB through API routes
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

module.exports = nextConfig;
