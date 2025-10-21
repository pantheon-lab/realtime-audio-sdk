import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig(({ command, mode }) => ({
  plugins:
    command === "build"
      ? [
          dts({
            insertTypesEntry: true,
            rollupTypes: true,
          }),
        ]
      : [],
  root: command === "serve" && mode !== "test" ? "./examples" : "./",
  build:
    command === "build"
      ? {
          lib: {
            entry: resolve(__dirname, "src/index.ts"),
            name: "RealtimeAudioSDK",
            formats: ["es", "cjs"],
            fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
          },
          rollupOptions: {
            external: ["onnxruntime-web"],
            output: {
              globals: {},
            },
          },
          sourcemap: true,
          minify: "terser",
          terserOptions: {
            compress: {
              drop_console: false,
            },
          },
        }
      : undefined,
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  server: {
    fs: {
      allow: ["..", "./node_modules"],
    },
  },
  assetsInclude: ["**/*.wasm", "**/*.mjs"],
  test: {
    globals: true,
    environment: "node",
    setupFiles: "./tests/setup.ts",
    testTimeout: 30000, // 30 seconds for VAD tests
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["tests/**", "examples/**", "scripts/**"],
    },
  },
}));
