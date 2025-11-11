import type { NextConfig } from "next";
import withBundleAnalyzer from '@next/bundle-analyzer';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env.config file if it exists
config({ path: resolve(__dirname, 'env.config') });

// Bundle analyzer configuration (enabled with ANALYZE=true)
const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Disable log forwarding in development to improve startup performance
  // This prevents server-side console logs from being forwarded to the browser
  logging: {
    fetches: {
      fullUrl: false, // Don't log full URLs in development
    },
  },
  
  // Experimental performance features
  experimental: {
    // optimizeCss: true, // Disabled - requires 'critters' package to be installed
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-tooltip',
    ],
  },

  // Reduce Fast Refresh rebuilds
  // This helps prevent unnecessary rebuilds that slow down development
  reactStrictMode: true,
  
  // Optimize Fast Refresh behavior
  // Reduce unnecessary recompilations during development
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 60 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 5,
  },

  // Image optimization configuration
  images: {
    formats: ['image/avif', 'image/webp'], // Modern image formats
    deviceSizes: [640, 750, 828, 1080, 1200], // Common device sizes
    imageSizes: [16, 32, 48, 64, 96], // Common icon sizes
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.google.com',
        pathname: '/s2/favicons/**',
      },
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
      },
      {
        protocol: 'https',
        hostname: '**', // Allow all HTTPS images (for search result thumbnails)
      },
    ],
  },

  // Turbopack configuration (faster than webpack for development)
  // Turbopack is 10x faster for updates and 700x faster for cold starts
  // Note: Turbopack automatically handles server-only modules (Prisma, sharp, etc.)
  // No explicit configuration needed - it's smarter than webpack about this
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },

  // Webpack fallback configuration (used only if --webpack flag is used)
  webpack: (config, { isServer }) => {
    // Optimize file watching to reduce unnecessary rebuilds
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/__tests__/**',
        '**/*.log',
        '**/*.tsbuildinfo',
        '**/prisma/migrations/**',
        '**/mcp-server/dist/**',
        '**/mcp-server-image-editing/dist/**',
      ],
      aggregateTimeout: 300, // Wait 300ms before rebuilding after a change
      poll: false, // Disable polling (use native file system events)
    };

    // Exclude Node.js built-in modules from client-side bundling
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        "fs/promises": false,
        path: false,
        os: false,
      };
      
      // Mark server-only modules as external for client-side
      // Convert externals to a function to properly handle all cases
      const originalExternals = config.externals;
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : []),
        ({ request }: { request?: string }, callback: (err: Error | null, result?: string) => void) => {
          // Block Prisma and related modules from client bundle
          if (
            request === '@prisma/client' ||
            request?.includes('@prisma/client') ||
            request === 'sharp' ||
            request?.includes('/prisma/') ||
            request?.includes('\\prisma\\')
          ) {
            return callback(null, `commonjs ${request}`);
          }
          // Block server-only utility modules that use Node.js APIs
          if (
            request?.includes('tool-call-interceptor') ||
            request?.includes('filesystem-index') ||
            request?.includes('path-resolution')
          ) {
            return callback(null, `commonjs ${request}`);
          }
          // Handle array-based externals
          if (Array.isArray(originalExternals)) {
            for (const external of originalExternals) {
              if (typeof external === 'string' && request === external) {
                return callback(null, `commonjs ${request}`);
              }
            }
          }
          callback(null);
        },
      ];
    }
    
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

// Export config with bundle analyzer wrapper
export default bundleAnalyzer(nextConfig);
