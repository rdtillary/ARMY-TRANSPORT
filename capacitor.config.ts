import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.army.transport.cms",
  appName: "MCTE Transport",
  // webDir holds the static app shell; the live app is loaded from server.url below.
  webDir: "capacitor-web",
  server: {
    // IMPORTANT — point this at wherever the Next.js app is running:
    //   Field / LAN testing:  "http://192.168.1.50:3000"  (your PC's LAN IP)
    //   Deployed build:       "https://your-deployed-url.example.com"
    // Leave blank only if you later switch to a fully static export.
    url: "",
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true, // allows http:// on LAN while field-testing
  },
};

export default config;
