/**
 * Sentry under-vehicle stitcher (runs in the browser, no server load).
 *
 * The footage is a camera travelling along the underside of a vehicle (or the vehicle
 * passing over a camera). We sample frames, estimate the horizontal motion between
 * consecutive frames by block matching on a small grayscale copy, and lay the *newly
 * revealed* strip of every frame side by side — a push-broom mosaic, the same idea as
 * a line-scan under-vehicle scanner. The result is one long image of the whole underside.
 */

export type StitchResult = {
  blob: Blob;
  url: string; // object URL for preview
  width: number;
  height: number;
  frames: number;
  duration: number;
};

const OUT_H = 420; // height of the stitched strip
const SMALL_W = 96; // analysis width
const MAX_OUT_W = 7000;

function waitFor(el: HTMLVideoElement, ev: string) {
  return new Promise<void>((res, rej) => {
    const ok = () => {
      el.removeEventListener(ev, ok);
      el.removeEventListener("error", bad);
      res();
    };
    const bad = () => {
      el.removeEventListener(ev, ok);
      el.removeEventListener("error", bad);
      rej(new Error("Could not read this video"));
    };
    el.addEventListener(ev, ok);
    el.addEventListener("error", bad);
  });
}

async function seek(v: HTMLVideoElement, t: number) {
  const p = waitFor(v, "seeked");
  v.currentTime = t;
  await p;
}

/** Horizontal shift (small-px, sub-pixel) that content moved from frame a → b. */
function estimateShift(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, h: number, maxLag: number) {
  const costs = new Map<number, number>();
  let best = 0;
  let bestCost = Infinity;
  for (let s = -maxLag; s <= maxLag; s++) {
    // content at x in A appears at x + s in B
    const x0 = Math.max(0, -s);
    const x1 = Math.min(w, w - s);
    if (x1 - x0 < w * 0.4) continue;
    let sum = 0;
    let n = 0;
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = x0; x < x1; x += 1) {
        sum += Math.abs(a[row + x] - b[row + x + s]);
        n++;
      }
    }
    const cost = sum / n;
    costs.set(s, cost);
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  // parabolic interpolation around the minimum for sub-pixel accuracy
  const l = costs.get(best - 1);
  const r = costs.get(best + 1);
  if (l !== undefined && r !== undefined) {
    const den = l - 2 * bestCost + r;
    if (den > 1e-6) return best + Math.max(-0.5, Math.min(0.5, (l - r) / (2 * den)));
  }
  return best;
}

export async function stitchVideo(
  file: File,
  onProgress?: (pct: number, msg: string) => void
): Promise<StitchResult> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await waitFor(v, "loadeddata");
    const dur = v.duration;
    if (!isFinite(dur) || dur <= 0 || !v.videoWidth) throw new Error("Could not read this video");

    const fh = OUT_H;
    const fw = Math.round((v.videoWidth / v.videoHeight) * fh);
    const sh = Math.max(24, Math.round((SMALL_W * v.videoHeight) / v.videoWidth));

    const n = Math.min(160, Math.max(16, Math.ceil(dur * 8)));
    const frameCv = document.createElement("canvas");
    frameCv.width = fw;
    frameCv.height = fh;
    const fctx = frameCv.getContext("2d", { willReadFrequently: true })!;
    const smallCv = document.createElement("canvas");
    smallCv.width = SMALL_W;
    smallCv.height = sh;
    const sctx = smallCv.getContext("2d", { willReadFrequently: true })!;

    const frames: HTMLCanvasElement[] = [];
    const grays: Uint8ClampedArray[] = [];
    for (let i = 0; i < n; i++) {
      await seek(v, Math.min(dur - 0.001, (i / (n - 1)) * dur));
      fctx.drawImage(v, 0, 0, fw, fh);
      const keep = document.createElement("canvas");
      keep.width = fw;
      keep.height = fh;
      keep.getContext("2d")!.drawImage(frameCv, 0, 0);
      frames.push(keep);

      sctx.drawImage(v, 0, 0, SMALL_W, sh);
      const d = sctx.getImageData(0, 0, SMALL_W, sh).data;
      const g = new Uint8ClampedArray(SMALL_W * sh);
      for (let p = 0; p < g.length; p++) g[p] = (d[p * 4] * 77 + d[p * 4 + 1] * 150 + d[p * 4 + 2] * 29) >> 8;
      grays.push(g);
      onProgress?.(Math.round(((i + 1) / n) * 70), "Reading frames");
    }

    // motion between consecutive frames
    const maxLag = Math.floor(SMALL_W * 0.45);
    const shifts: number[] = [];
    for (let i = 1; i < n; i++) {
      shifts.push(estimateShift(grays[i - 1], grays[i], SMALL_W, sh, maxLag));
      if (i % 8 === 0) {
        onProgress?.(70 + Math.round((i / n) * 20), "Aligning frames");
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    // dominant direction: content moving left (s<0) = camera moving right
    const moving = shifts.filter((s) => Math.abs(s) > 0.05);
    const neg = moving.filter((s) => s < 0).length;
    const leftward = neg >= moving.length / 2;
    const scale = fw / SMALL_W;

    // strips (time order). strip i = newly revealed columns of frame i
    const strips: { cv: HTMLCanvasElement; x: number; w: number }[] = [{ cv: frames[0], x: 0, w: fw }];
    let acc = 0;
    let prevPx = 0;
    for (let i = 1; i < n; i++) {
      const s = shifts[i - 1];
      // ignore moves against the dominant direction (noise)
      acc += leftward ? Math.max(0, -s) : Math.max(0, s);
      const px = Math.round(acc * scale);
      const w = Math.min(px - prevPx, fw);
      if (w <= 0) continue;
      prevPx = px;
      strips.push(leftward ? { cv: frames[i], x: fw - w, w } : { cv: frames[i], x: 0, w });
    }

    let total = strips.reduce((a, s) => a + s.w, 0);
    const ordered = leftward ? strips : [...strips].reverse();
    const shrink = total > MAX_OUT_W ? MAX_OUT_W / total : 1;

    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(total * shrink));
    out.height = Math.round(fh * shrink);
    const octx = out.getContext("2d")!;
    octx.imageSmoothingQuality = "high";
    let x = 0;
    for (const s of ordered) {
      const w = s.w * shrink;
      octx.drawImage(s.cv, s.x, 0, s.w, fh, x, 0, w + 0.6, out.height);
      x += w;
    }
    onProgress?.(95, "Rendering");
    const blob: Blob = await new Promise((res, rej) =>
      out.toBlob((b) => (b ? res(b) : rej(new Error("Render failed"))), "image/jpeg", 0.88)
    );
    onProgress?.(100, "Done");
    return {
      blob,
      url: URL.createObjectURL(blob),
      width: out.width,
      height: out.height,
      frames: n,
      duration: dur,
    };
  } finally {
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
    v.load();
  }
}
