import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { GeoPos } from "./geo";

/** Native foreground-service tracker (Android APK only). */
export type TrackerPlugin = {
  start(opts: { tripId: number; baseUrl: string; token: string }): Promise<void>;
  /** Resolves after unsent points were flushed and the service stopped. */
  stop(): Promise<void>;
  requestBatteryExemption(): Promise<{ ignoring: boolean }>;
  addListener(event: "position", cb: (p: GeoPos) => void): Promise<PluginListenerHandle>;
};

export const Tracker = registerPlugin<TrackerPlugin>("Tracker");
