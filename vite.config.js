import { defineConfig } from "vite";

let config = {
  resolve: {
    alias: {
      "display-node_utils": "src/display/node_utils.js",
    },
  },
  build: {
    target: "ES2015",
    outDir:"build/generic-legacy/build",
    minify:false,
    lib: {
      name: "pdf.js",
      entry: ["src/pdf.js","src/pdf.worker.js"],
      fileName: (format, entryName) => `${entryName}.js`,
      cssFileName: "my-lib-style",
    },
  },
};
config.resolve.alias["display-cmap_reader_factory"] =
  "src/display/cmap_reader_factory.js";
config.resolve.alias["display-standard_fontdata_factory"] =
  "src/display/standard_fontdata_factory.js";
config.resolve.alias["display-wasm_factory"] = "src/display/wasm_factory.js";
config.resolve.alias["display-fetch_stream"] = "src/display/fetch_stream.js";
config.resolve.alias["display-network"] = "src/display/network.js";
config.resolve.alias["display-node_stream"] = "src/display/node_stream.js";
config.resolve.alias["display-node_utils"] = "src/display/node_utils.js";

export default defineConfig(config);
