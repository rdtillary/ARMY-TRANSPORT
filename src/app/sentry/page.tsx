"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine, Upload, Trash2, X, Film, Layers, Loader2, AlertCircle, Maximize2 } from "lucide-react";
import TopBar from "@/components/TopBar";
import { getSession, timeAgo, type Session } from "@/lib/session";
import { stitchVideo } from "@/lib/stitch";

type Scan = {
  id: number | string;
  label: string;
  uploadedBy: string;
  videoSrc: string;
  stitchedUrl: string;
  frames: number;
  durationSec: number;
  ts: string | null; // null = built-in demo
  demo?: boolean;
};

const DEMO: Scan = {
  id: "demo",
  label: "DEMO — Sample sedan underside",
  uploadedBy: "System demo",
  videoSrc: "/sentry/demo-scan.mp4",
  stitchedUrl: "/sentry/demo-stitched.jpg",
  frames: 72,
  durationSec: 9,
  ts: null,
  demo: true,
};

export default function SentryPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<{ pct: number; msg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Scan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== "sentry") {
      router.replace("/");
      return;
    }
    setSession(s);
  }, [router]);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/sentry/scans").then((r) => r.json());
      setScans(
        (d.scans || []).map((x: any) => ({
          id: x.id,
          label: x.label,
          uploadedBy: x.uploadedBy,
          videoSrc: `/api/sentry/scans/${x.id}/video`,
          stitchedUrl: x.stitchedUrl,
          frames: x.frames,
          durationSec: x.durationSec,
          ts: x.ts,
        }))
      );
    } catch {
      /* demo row still shows */
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    load();
    const c = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(c);
  }, [session, load]);

  const onPick = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    if (!file.type.startsWith("video/")) return setError("Please choose a video file.");
    if (file.size > 80 * 1024 * 1024) return setError("Footage is too large (max 80 MB).");
    try {
      setBusy({ pct: 0, msg: "Starting" });
      const r = await stitchVideo(file, (pct, msg) => setBusy({ pct, msg }));
      URL.revokeObjectURL(r.url);
      setBusy({ pct: 97, msg: "Saving scan" });
      const fd = new FormData();
      fd.append("video", file);
      fd.append("stitched", new File([r.blob], "stitched.jpg", { type: "image/jpeg" }));
      fd.append("label", file.name.replace(/\.[^.]+$/, ""));
      fd.append("frames", String(r.frames));
      fd.append("duration", String(r.duration));
      const res = await fetch("/api/sentry/scans", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Upload failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (s: Scan) => {
    if (s.demo || !confirm(`Delete scan "${s.label}"?`)) return;
    await fetch(`/api/sentry/scans/${s.id}`, { method: "DELETE" });
    load();
  };

  if (!session) return null;
  const rows = [...scans, DEMO];

  return (
    <div className="min-h-screen bg-[#121810] text-[#eee8d0]">
      <TopBar role="SENTRY — UNDER-VEHICLE SCAN" name={session.name} unit={session.unit} />

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-5">
        {/* Upload */}
        <section className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold flex items-center gap-2">
                <ScanLine size={20} className="text-[#d4c48a]" /> UNDER-VEHICLE SCANNING SYSTEM
              </h1>
              <p className="text-xs text-[#a89a76] mt-1 max-w-xl">
                Upload the 360° footage taken under a vehicle. Every frame is aligned and stitched into
                one continuous image of the underside, shown beside the footage below.
              </p>
            </div>
            <div className="shrink-0">
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0])}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!!busy}
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#8b6f2e] to-[#bfa15a] text-[#1a1508] font-extrabold rounded-xl text-sm hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {busy ? "PROCESSING…" : "UPLOAD FOOTAGE"}
              </button>
            </div>
          </div>

          {busy && (
            <div className="mt-4">
              <div className="flex justify-between text-[11px] text-[#a89a76] mb-1">
                <span>{busy.msg}…</span>
                <span>{busy.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#141c0e] overflow-hidden">
                <div className="h-full bg-[#d4c48a] transition-all" style={{ width: `${busy.pct}%` }} />
              </div>
            </div>
          )}
          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-xl px-3 py-2.5">
              <AlertCircle size={15} className="shrink-0" /> {error}
            </div>
          )}
        </section>

        {/* Scans table */}
        <section className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-2.5 border-b border-[#8b6f2e]/20 text-[10px] font-extrabold tracking-widest text-[#d4c48a]">
            <span className="flex items-center gap-1.5"><Film size={12} /> UPLOADED FOOTAGE (LOOPING)</span>
            <span className="flex items-center gap-1.5"><Layers size={12} /> STITCHED UNDERSIDE IMAGE</span>
          </div>

          <div className="divide-y divide-[#8b6f2e]/15">
            {rows.map((s) => (
              <div key={s.id} className="p-4 grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
                <div className="min-w-0">
                  <video
                    src={s.videoSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="w-full aspect-video object-cover rounded-xl bg-black border border-[#8b6f2e]/20"
                  />
                  <div className="flex items-start justify-between gap-2 mt-2">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold truncate">
                        {s.label}
                        {s.demo && (
                          <span className="ml-2 text-[9px] align-middle border border-amber-600/40 text-amber-300 rounded px-1.5 py-0.5">
                            DEMO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#8b8064] truncate">
                        {s.uploadedBy}
                        {s.ts ? ` • ${timeAgo(s.ts, now)}` : ""} • {s.frames} frames • {Math.round(s.durationSec)}s
                      </div>
                    </div>
                    {!s.demo && (
                      <button
                        onClick={() => remove(s)}
                        className="text-[#6d5f45] hover:text-rose-300 shrink-0"
                        aria-label="Delete scan"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setZoom(s)}
                  className="group relative min-w-0 rounded-xl overflow-hidden border border-[#8b6f2e]/20 bg-black self-start"
                  aria-label="Open stitched image"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.stitchedUrl} alt={`Stitched underside — ${s.label}`} className="w-full h-auto block" />
                  <span className="absolute top-2 right-2 bg-black/60 rounded-md p-1.5 text-[#eee8d0] opacity-0 group-hover:opacity-100 transition">
                    <Maximize2 size={14} />
                  </span>
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>

      {zoom && (
        <div
          className="fixed inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setZoom(null)}
        >
          <button className="absolute top-4 right-4 text-[#eee8d0]" aria-label="Close">
            <X size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.stitchedUrl} alt="Stitched underside" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
          <div className="text-xs text-[#a89a76] mt-3">{zoom.label}</div>
        </div>
      )}
    </div>
  );
}
