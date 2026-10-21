import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { GeoPos } from "./geo";
import { getSession } from "./session";

/**
 * Offline-safe position uploader.
 * Points are persisted before upload. Only points acknowledged by the server
 * are removed from local storage. Failed uploads remain queued for retry.
 */

const MAX_QUEUE = 5000;
const BATCH = 200;

// Serialize flushes per trip, but allow different trips to flush independently.
const flushes = new Map<number, Promise<boolean>>();

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
    // Storage may be full or unavailable. Do not pretend the queue was saved.
  }
}

async function post(body: unknown): Promise<number> {
  const url = `${window.location.origin}/api/trips/track`;

  // Native HTTP does not share the WebView cookie, so send the login token.
  const token = getSession()?.token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.post({ url, headers, data: body });
    return r.status;
  }

  const r = await fetch(url, {
    method: "POST",
    headers,
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

async function drain(tripId: number): Promise<boolean> {
  for (;;) {
    const queued = load(tripId);
    if (queued.length === 0) return true;

    const batch = queued.slice(0, BATCH);
    let status: number;

    try {
      status = await post({ tripId, points: batch });
    } catch {
      return false; // Network unavailable; keep every point for retry.
    }

    // Trip already ended on the server (auto-stop / force-stop / completed).
    // The server will never accept these points, so stop retrying.
    if (status === 409) {
      save(tripId, []);
      return true;
    }

    // Server says this batch is invalid and can never succeed. Drop it so it
    // does not block every later point.
    if (status === 400) {
      const current = load(tripId);
      save(tripId, current.slice(batch.length));
      continue;
    }

    if (status < 200 || status >= 300) {
      // 401 (not logged in) / 5xx: keep the points and retry later.
      return false;
    }

    // Remove only the exact prefix that was acknowledged. New points may
    // have arrived during the request; they remain in the queue.
    const current = load(tripId);
    const prefixMatches =
      current.length >= batch.length &&
      batch.every(
        (point, index) => JSON.stringify(current[index]) === JSON.stringify(point)
      );

    if (!prefixMatches) {
      // Queue changed unexpectedly (e.g. oldest points trimmed at MAX_QUEUE).
      // Preserve it and let the next flush start from the new head.
      return false;
    }

    save(tripId, current.slice(batch.length));
  }
}

/**
 * Drain the queue for a trip.
 * Resolves true only when the queue is empty. Resolves false if any batch
 * cannot be confirmed, leaving unconfirmed points in local storage.
 * Concurrent callers for the same trip share the same in-flight flush.
 */
export function flush(tripId: number): Promise<boolean> {
  const existing = flushes.get(tripId);
  if (existing) return existing;

  const task = drain(tripId);
  // Register first, clean up afterwards. (Cleaning up inside the async body
  // can run before the set() and leave a finished promise stuck in the map,
  // which would make every later flush a no-op.)
  flushes.set(tripId, task);
  void task.finally(() => {
    if (flushes.get(tripId) === task) flushes.delete(tripId);
  });
  return task;
}

/**
 * Clear only when the caller has explicitly confirmed that the trip is safely
 * closed and no queued points need to be retained.
 */
export function clearQueue(tripId: number) {
  save(tripId, []);
}
