import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer, dir }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    config.output.webassemblyModuleFilename =
      isServer ? "../static/wasm/[modulehash].wasm" : "static/wasm/[modulehash].wasm";

    // Mark server-only dependencies as external on client builds
    if (!isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals]).filter(Boolean),
        "argon2",
        "argon2id",
        "node:crypto",
      ];

      config.resolve.fallback = {
        ...config.resolve.fallback,
        "argon2": false,
        "argon2id": false,
        "node:crypto": false,
        "crypto": false,
      };

      // Ignore argon2id module entirely on client
      config.module.rules.push({
        test: /argon2id/,
        use: "null-loader",
      });
    }

    return config;
  },
};

export default nextConfig;
