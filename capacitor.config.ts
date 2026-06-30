import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Remote-shell mode: the iOS WebView loads production.
 * Local `webDir` is only a Capacitor bootstrap fallback and does not ship app UI.
 */
const config: CapacitorConfig = {
  appId: "com.classmate.room",
  appName: "Classmate",
  webDir: "public",
  server: {
    url: "https://classmate-room.com",
    cleartext: false,
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
    allowsLinkPreview: true,
    scrollEnabled: true,
  },
};

export default config;
