import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js spawns native WASM worker processes at runtime and must not
  // be bundled by the server compiler (otherwise requests hang).
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
