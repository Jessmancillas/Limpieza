import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App autenticada y 100 % dinámica: no usamos Cache Components.
  cacheComponents: false,
  // Módulos nativos que deben cargarse desde node_modules en el servidor.
  serverExternalPackages: ["better-sqlite3", "sharp"],
  experimental: {
    serverActions: {
      // Los anexos PDF se suben por server actions.
      bodySizeLimit: "30mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
