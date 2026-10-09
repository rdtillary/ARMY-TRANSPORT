import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { GeoPos } from "./geo";

/**
 * Offline-safe position uploader.
 * Every fix is stored locally first, then flushed to /api/trips/track in
 * batches. If the phone is asleep, offline or the server is slow, nothing is
 * lost: the queue is sent (with the original capture times) as soon as the
 * connection works again, so the route has no gaps.
 */

const MAX_QUEUE = 5000;
const BATCH = 200;
let flushing = false;

const key = (tripId: number) => `track-queue:${tripId}`;

function load(tripId: number): GeoPos[] {
  try {
    const raw = localStorage.getItem(key(tripId));
    return raw ? (JSON.parse(raw) as GeoPos[]) : [];
  } catch {
    return [];
  }
}

function save(tripId: number, q: GeoPos[]) {
  try {
    if (q.length === 0) localStorage.removeItem(key(tripId));
    else localStorage.setItem(key(tripId), JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    // storage full / unavailable — keep going without persistence
  }
}

async function post(body: unknown): Promise<number> {
  const url = `${window.location.origin}/api/trips/track`;
  // Native HTTP is not throttled by Android when the WebView is in the background.
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.post({
      url,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
    return r.status;
  }
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  return r.status;
}

export function enqueue(tripId: number, p: GeoPos) {
  const q = load(tripId);
  q.push({ ...p, ts: p.ts ?? Date.now() });
  save(tripId, q);
}

export async function flush(tripId: number): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const q = load(tripId);
      if (q.length === 0) return;
      const batch = q.slice(0, BATCH);
      let status = 0;
      try {
        status = await post({ tripId, points: batch });
      } catch {
        return; // offline — keep the queue, retry on the next flush
      }
      if (status >= 200 && status < 300) {
        // new points may have been queued while this request was in flight
        save(tripId, load(tripId).slice(batch.length));
      } else if (status === 409) {
        save(tripId, []); // trip already ended — nothing left to report
        return;
      } else {
        return; // server error — retry later
      }
    }
  } finally {
    flushing = false;
  }
}

export function clearQueue(tripId: number) {
  save(tripId, []);
}
