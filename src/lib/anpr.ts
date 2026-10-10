import sharp from "sharp";

export type AnprResult = {
  plate: string | null;
  compact: string | null;
  confidence: number; // 0-100
  engine: "plate-recognizer" | "tesseract" | "none";
  rawText: string;
};

/** Normalise a plate for comparison: uppercase, strip separators. */
export function compactPlate(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "MP09AB1234" -> "MP 09 AB 1234"; "0012AB3456" -> "0012 AB 3456" */
export function formatPlate(compact: string): string {
  const mil = compact.match(/^([0-9]{4})([A-Z]{2})([0-9]{4})$/);
  if (mil) return `${mil[1]} ${mil[2]} ${mil[3]}`;
  const m = compact.match(/^([A-Z]{2})([0-9]{1,2})([A-Z]*)([0-9]{1,4})$/);
  if (!m) return compact.replace(/(.{2})(.{2})/, "$1 $2").trim();
  const [, st, rto, series, digits] = m;
  const padDigits = digits.length < 4 ? digits.padStart(4, "0") : digits;
  return [st, rto, series, padDigits].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

const toDigits = (s: string) =>
  s.split("").map((c) => (/[0-9]/.test(c) ? c : LETTER_TO_DIGIT[c] || c)).join("");
const toLetters = (s: string) =>
  s.split("").map((c) => (/[A-Z]/.test(c) ? c : DIGIT_TO_LETTER[c] || c)).join("");

const LETTER_TO_DIGIT: Record<string, string> = {
  O: "0", Q: "0", D: "0",
  I: "1", L: "1", T: "1",
  Z: "2",
  B: "8",
  S: "5",
  G: "6",
};
const DIGIT_TO_LETTER: Record<string, string> = { 0: "O", 1: "I", 8: "B", 5: "S", 6: "G", 2: "Z" };

export function extractIndianPlate(raw: string): string | null {
  const text = raw.toUpperCase();
  const compact = text.replace(/[^A-Z0-9]/g, "");

  const mil = compact.match(/[0-9]{4}[A-Z]{2}[0-9]{4}/)?.[0];
  if (mil) {
    return (
      toDigits(mil.slice(0, 4)) +
      toLetters(mil.slice(4, 6)) +
      toDigits(mil.slice(6, 10))
    );
  }

  const tryMatch = (s: string) =>
    s.match(/[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}/)?.[0] || null;

  let hit = tryMatch(compact);

  if (!hit) {
    const stateCodes =
      "AP|AR|AS|BR|CG|CH|DD|DL|GA|GJ|HP|HR|JH|JK|KA|KL|LA|LD|MH|ML|MN|MP|MZ|NL|OD|PB|PY|RJ|SK|TG|TN|TS|UK|UP|WB";
    const st = compact.match(new RegExp(`(?:${stateCodes})[A-Z0-9]{5,9}`));
    if (st) {
      const frag = st[0];
      const code = frag.slice(0, 2);
      let rest = frag.slice(2);
      rest = rest.replace(/^([A-Z])(?=[A-Z0-9])/, (_, c) => LETTER_TO_DIGIT[c] || c);
      rest = rest.replace(/^([0-9])([A-Z])(?=[A-Z0-9])/, (_, d, c) => d + c);
      rest = rest.replace(/^([0-9])([A-Z])(?=[A-Z])/, (_, d, c) => d + (LETTER_TO_DIGIT[c] || c));
      rest = rest.replace(/[A-Z0-9]{4}$/g, (tail) =>
        tail.split("").map((c) => (/[0-9]/.test(c) ? c : LETTER_TO_DIGIT[c] || c)).join("")
      );
      rest = rest.replace(/^([0-9]{1,2})([0-9A-Z]+?)([0-9]{4})$/, (_m, rto, series, end) => {
        const fixedSeries = series.split("").map((c: string) =>
          (/[A-Z]/.test(c) ? c : DIGIT_TO_LETTER[c] || c)
        ).join("");
        return rto + fixedSeries + end;
      });
      hit = tryMatch(code + rest);
    }
  }

  if (!hit) return null;
  const m = hit.match(/^([A-Z]{2})([0-9]{1,2})([A-Z]{0,3})([0-9]{1,4})$/);
  if (m) {
    const [, st, rto, series, digits] = m;
    const paddedDigits = digits.padStart(4, "0");
    return st + rto.padStart(2, "0") + series + paddedDigits;
  }
  return hit;
}

async function preprocess(buf: Buffer) {
  const meta = await sharp(buf).rotate().metadata();
  const width = meta.width || 1000;
  const scale = width < 1200 ? 2 : 1;
  const targetW = Math.min(2000, width * scale);
  const base = sharp(buf).rotate().resize({ width: targetW, withoutEnlargement: false });

  const [gray, binary] = await Promise.all([
    base.clone().greyscale().normalise().sharpen({ sigma: 1.4 }).jpeg({ quality: 92 }).toBuffer(),
    base.clone().greyscale().normalise().sharpen({ sigma: 1.6 }).threshold(150).jpeg({ quality: 92 }).toBuffer(),
  ]);
  return { gray, binary };
}

async function localTesseract(buf: Buffer): Promise<AnprResult> {
  const { gray, binary } = await preprocess(buf);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    cachePath: "/tmp/tessdata",
    workerBlobURL: false,
  });
  const attempts: { text: string; conf: number; psm: number }[] = [];
  try {
    for (const psm of [11, 7]) {
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -",
        tessedit_pageseg_mode: psm as any,
      });
      for (const img of [gray, binary]) {
        const r = await worker.recognize(img);
        attempts.push({ text: r.data.text || "", conf: r.data.confidence || 0, psm });
      }
    }
  } finally {
    await worker.terminate();
  }

  let best: { plate: string; conf: number; raw: string } | null = null;
  for (const a of attempts) {
    const plate = extractIndianPlate(a.text);
    if (plate && (!best || a.conf > best.conf)) {
      best = { plate, conf: a.conf, raw: a.text };
    }
  }
  if (!best) {
    const raw = attempts.sort((x, y) => y.conf - x.conf)[0]?.text || "";
    return { plate: null, compact: null, confidence: 0, engine: "tesseract", rawText: raw };
  }
  return {
    plate: formatPlate(best.plate),
    compact: best.plate,
    confidence: Math.round(Math.min(95, Math.max(40, best.conf))),
    engine: "tesseract",
    rawText: best.raw,
  };
}

async function cloudPlateRecognizer(buf: Buffer): Promise<AnprResult | null> {
  const token = process.env.PLATE_RECOGNIZER_TOKEN;
  if (!token) return null;
  try {
    const blob = new Blob([new Uint8Array(buf)], { type: "image/jpeg" });
    const fd = new FormData();
    fd.append("upload", blob, "capture.jpg");
    // Send both India regions for better accuracy
    // "in" = India general, plus state-specific hints improve military plate reading
    fd.append("regions", "in");
    fd.append("config", JSON.stringify({
      // Return ALL plates found in the image, not just the first one
      // This is critical for gate camera photos with multiple vehicles
      mode: "redaction",
      detection_rule: "strict",
    }));

    const res = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
      method: "POST",
      headers: { Authorization: `Token ${token}` },
      body: fd,
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Pick the result with highest score — for gate photos with multiple
    // vehicles this picks the closest / most prominent plate
    const results: any[] = data?.results || [];
    if (results.length === 0) {
      return { plate: null, compact: null, confidence: 0, engine: "plate-recognizer", rawText: "" };
    }

    // Sort by score descending and pick best
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = results[0];

    if (!top?.plate) {
      return { plate: null, compact: null, confidence: 0, engine: "plate-recognizer", rawText: "" };
    }

    const compact = compactPlate(top.plate);
    return {
      plate: formatPlate(compact) || top.plate.toUpperCase(),
      compact,
      // Use dscore (detection score) combined with score for better confidence
      confidence: Math.round(((top.score ?? 0.5) * 0.6 + (top.dscore ?? 0.5) * 0.4) * 100),
      engine: "plate-recognizer",
      rawText: JSON.stringify(results.slice(0, 3)), // keep top 3 for debugging
    };
  } catch {
    return null;
  }
}

export async function recognizePlate(buf: Buffer): Promise<AnprResult> {
  const cloud = await cloudPlateRecognizer(buf).catch(() => null);
  if (cloud?.plate) return cloud;
  return localTesseract(buf);
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

export function scorePlate(readCompact: string, fleetCompact: string): number {
  if (!readCompact || !fleetCompact) return 0;
  if (readCompact === fleetCompact) return 1;
  if (fleetCompact.includes(readCompact) || readCompact.includes(fleetCompact)) return 0.92;
  const dist = levenshtein(readCompact, fleetCompact);
  return Math.max(0, 1 - dist / Math.max(readCompact.length, fleetCompact.length));
}
