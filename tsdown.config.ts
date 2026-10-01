import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    generator: "src/generator.ts",
    bin: "src/bin.ts",
  },
  format: ["esm"],
  platform: "neutral",
  deps: { neverBundle: [/^node:/] },
  dts: true,
  clean: true,
  sourcemap: true,
});
