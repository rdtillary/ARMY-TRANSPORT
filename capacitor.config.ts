import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.army.transport.cms",
  appName: "MCTE Transport",
  webDir: "capacitor-web",
  server: { url: "", androidScheme: "https" },
  android: { allowMixedContent: true },
};
export default config;
