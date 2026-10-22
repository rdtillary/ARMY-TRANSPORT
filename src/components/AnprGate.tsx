"use client";
import { useEffect, useRef, useState } from "react";
import {
  Camera, CameraOff, UploadCloud, X, ScanLine, ShieldCheck, AlertTriangle,
  Loader2, CheckCircle2, XCircle, Trash2,
} from "lucide-react";

type FleetVehicle = { id: number; regNo: string; type: string; parkStatus?: string };
type Match = { vehicleId: number; regNo: string; type: string; unit: string; score: number; parkStatus?: string };

type Recognized = {
  plate: string | null;
  confidence: number;
  engine: string;
  rawText?: string;
  matches: Match[];
  thumbDataUrl: string;
};

type BatchItem = {
  id: number;
  file: File | Blob;
  name: string;
  preview: string;
  status: "reading" | "ready" | "logging" | "done" | "error";
  rec?: Recognized;
  plate: string;
  vehicleId: number | "";
  msg?: string;
};

export default function AnprGate({ onScanned }: { onScanned: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [streamReady, setStreamReady] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<Recognized | null>(null);
  const [plateInput, setPlateInput] = useState("");
  const [vehicleId, setVehicleId] = useState<number | "">("");
  const [direction, setDirection] = useState("auto");
  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // Multi-photo upload
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const batchSeq = useRef(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Open/close lifecycle */
  useEffect(() => {
    if (!open) return;
    fetch("/api/vehicles")
      .then((r) => r.json())
      .then((d) => setFleet(d.vehicles || []))
      .catch(() => {});
    return;
  }, [open]);

  useEffect(() => {
    if (open && mode === "camera") startCamera();
    else stopCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const startCamera = async () => {
    setCamError(null);
    setStreamReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreamReady(true);
    } catch {
      setCamError(
        "Camera unavailable (use the Upload tab). On a phone this needs HTTPS and camera permission; on a laptop allow the browser camera."
      );
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreamReady(false);
  };

  const resetBatch = () => {
    setBatch((items) => {
      items.forEach((i) => URL.revokeObjectURL(i.preview));
      return [];
    });
    setBatchRunning(false);
  };

  const reset = () => {
    setRec(null);
    setPreview(null);
    setFile(null);
    setPlateInput("");
    setVehicleId("");
    setResultMsg(null);
    setBusy(false);
    resetBatch();
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    stopCamera();
    reset();
    setOpen(false);
  };

  /* ---------- single image (camera capture or one uploaded photo) ---------- */
  const acceptImage = async (blob: Blob, dataUrl: string) => {
    setFile(blob);
    setPreview(dataUrl);
    setRec(null);
    setResultMsg(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", blob, "capture.jpg");
      const res = await fetch("/api/anpr/recognize", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        setResultMsg(d.error || "Recognition failed");
        return;
      }
      setRec(d);
      setPlateInput(d.plate || "");
      setVehicleId(d.matches?.[0]?.vehicleId ?? "");
    } catch {
      setResultMsg("Server unreachable — check connection");
    } finally {
      setBusy(false);
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        acceptImage(blob, URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.85
    );
  };

  /* ---------- upload: one photo = same flow as camera; many = batch ---------- */
  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list || []).filter((f) => f.type.startsWith("image/"));
    if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    if (files.length === 0) {
      setResultMsg("Please choose image files (JPEG / PNG).");
      return;
    }
    setResultMsg(null);

    if (files.length === 1) {
      acceptImage(files[0], URL.createObjectURL(files[0]));
      return;
    }

    // Multiple photos: read every plate one after another
    const items: BatchItem[] = files.map((f) => ({
      id: ++batchSeq.current,
      file: f,
      name: f.name,
      preview: URL.createObjectURL(f),
      status: "reading",
      plate: "",
      vehicleId: "",
    }));
    setBatch((prev) => [...prev, ...items]);
    setBatchRunning(true);

    for (const it of items) {
      try {
        const fd = new FormData();
        fd.append("image", it.file, it.name || "photo.jpg");
        const res = await fetch("/api/anpr/recognize", { method: "POST", body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Recognition failed");
        patchItem(it.id, {
          status: "ready",
          rec: d,
          plate: d.plate || "",
          vehicleId: d.matches?.[0]?.vehicleId ?? "",
        });
      } catch (e) {
        patchItem(it.id, {
          status: "error",
          msg: e instanceof Error ? e.message : "Recognition failed",
        });
      }
    }
    setBatchRunning(false);
  };

  const patchItem = (id: number, p: Partial<BatchItem>) =>
    setBatch((items) => items.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const removeItem = (id: number) =>
    setBatch((items) => {
      const gone = items.find((i) => i.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return items.filter((i) => i.id !== id);
    });

  const logAll = async () => {
    const todo = batch.filter((i) => i.status === "ready" && i.vehicleId);
    if (todo.length === 0) {
      setResultMsg("Select a matching vehicle for at least one photo.");
      return;
    }
    setResultMsg(null);
    setBatchRunning(true);
    let ok = 0;
    // One after another, so each scan sees the vehicle's updated IN/OUT state
    for (const it of todo) {
      patchItem(it.id, { status: "logging", msg: undefined });
      try {
        const fd = new FormData();
        fd.append("image", it.file, "gate.jpg");
        fd.append("vehicleId", String(it.vehicleId));
        fd.append("direction", direction);
        if (it.plate.trim()) fd.append("plateText", it.plate.trim().toUpperCase());
        const res = await fetch("/api/gate/scan", { method: "POST", body: fd });
        const d = await res.json();
        if (!res.ok || !d.scanned) throw new Error(d.error || "Scan could not be logged");
        patchItem(it.id, {
          status: "done",
          msg: `${d.regNo} — ${String(d.direction).toUpperCase()}`,
        });
        ok++;
      } catch (e) {
        patchItem(it.id, {
          status: "error",
          msg: e instanceof Error ? e.message : "Scan failed",
        });
      }
    }
    setBatchRunning(false);
    if (ok > 0) onScanned();
  };

  /* ---------- confirm single scan ---------- */
  const confirm = async () => {
    if (!file || !vehicleId) {
      setResultMsg("Select the matching vehicle to log the scan.");
      return;
    }
    setConfirming(true);
    setResultMsg(null);
    try {
      const fd = new FormData();
      fd.append("image", file, "gate.jpg");
      fd.append("vehicleId", String(vehicleId));
      fd.append("direction", direction);
      if (plateInput.trim()) fd.append("plateText", plateInput.trim().toUpperCase());
      const res = await fetch("/api/gate/scan", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok || !d.scanned) {
        setResultMsg(d.error || "Scan could not be logged");
        setConfirming(false);
        return;
      }
      onScanned();
      close();
    } catch {
      setResultMsg("Server unreachable");
      setConfirming(false);
    }
  };

  const selectCls =
    "w-full bg-[#141c0e] border border-[#8b6f2e]/30 rounded-lg px-3 py-2.5 font-bold";
  const showPicker = !rec && !busy && batch.length === 0;
  const readyCount = batch.filter((i) => i.status === "ready" && i.vehicleId).length;
  const doneCount = batch.filter((i) => i.status === "done").length;

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setMode("camera");
        }}
        className="flex items-center gap-2 text-xs font-extrabold px-3.5 py-2 rounded-lg border bg-[#2a361d] border-[#8b6f2e]/40 text-[#d4c48a] hover:bg-[#33421f] transition"
      >
        <Camera size={13} /> GATE CAMERA · ANPR
      </button>

      {open && (
        <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4" onClick={close}>
          <div
            className="bg-[#161f10] border border-[#8b6f2e]/40 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[#8b6f2e]/25">
              <h3 className="font-extrabold flex items-center gap-2">
                <ScanLine size={17} className="text-[#d4c48a]" /> GATE CAMERA — AUTOMATIC NUMBER PLATE READER
              </h3>
              <button onClick={close} className="p-2 rounded-lg border border-[#4a3a2a]/50 text-[#a89a76] hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Hidden file input lives OUTSIDE any button so the picker opens reliably */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />

              {!rec && !busy && batch.length === 0 && (
                <div className="flex bg-[#141c0e] border border-[#8b6f2e]/25 rounded-lg p-0.5 w-fit">
                  {(["camera", "upload"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`px-4 py-1.5 rounded-md text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
                        mode === m ? "bg-[#8b6f2e] text-[#1a1508]" : "text-[#a89a76]"
                      }`}
                    >
                      {m === "camera" ? <Camera size={12} /> : <UploadCloud size={12} />}
                      {m === "camera" ? "Live camera" : "Upload photos"}
                    </button>
                  ))}
                </div>
              )}

              {showPicker && mode === "camera" && (
                <div>
                  <div className="relative rounded-xl overflow-hidden border border-[#8b6f2e]/30 bg-black aspect-video">
                    <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                    {!streamReady && !camError && (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-[#a89a76]">
                        Starting camera…
                      </div>
                    )}
                    {camError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                        <CameraOff size={26} className="text-amber-300" />
                        <p className="text-xs text-amber-200">{camError}</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={capture}
                    disabled={!streamReady || busy}
                    className="mt-3 w-full py-3 bg-[#8b6f2e] text-[#1a1508] font-extrabold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Camera size={16} /> CAPTURE &amp; READ PLATE
                  </button>
                </div>
              )}

              {showPicker && mode === "upload" && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-[#8b6f2e]/50 rounded-xl py-12 flex flex-col items-center gap-2 text-[#a89a76] hover:border-[#c0a86c] hover:text-[#d4c48a] transition"
                >
                  <UploadCloud size={30} />
                  <span className="text-sm font-bold">Tap to choose one or many gate photographs</span>
                  <span className="text-[10px]">JPEG / PNG — select several to read and log them in one go</span>
                </button>
              )}

              {busy && (
                <div className="py-10 text-center">
                  <ScanLine size={34} className="mx-auto text-[#d4c48a] animate-pulse mb-2" />
                  <p className="text-sm font-bold">Analysing photograph and reading the number plate…</p>
                </div>
              )}

              {/* ---------- single photo result (camera or one upload) ---------- */}
              {rec && preview && (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden border border-[#8b6f2e]/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={rec.thumbDataUrl || preview} alt="gate capture" className="w-full max-h-72 object-cover mx-auto" />
                    {plateInput && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/85 border-2 border-[#d4c48a] px-4 py-1.5 rounded font-black tracking-[0.25em] text-lg text-[#f3e7c0]">
                        {plateInput}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="px-2 py-1 rounded-md bg-[#20301a] border border-emerald-600/40 text-emerald-300 font-extrabold flex items-center gap-1">
                      <ShieldCheck size={12} /> ANPR: {rec.engine === "plate-recognizer" ? "Cloud" : "On-board OCR"}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-[#141c0e] border border-[#8b6f2e]/30 text-[#d4c48a] font-bold">
                      Confidence {rec.confidence}%
                    </span>
                    {!rec.plate && (
                      <span className="px-2 py-1 rounded-md bg-amber-950/50 border border-amber-700/50 text-amber-200 font-bold flex items-center gap-1">
                        <AlertTriangle size={12} /> Plate unclear — type it and pick the vehicle
                      </span>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-[#a89a76] font-bold mb-1 block">
                        Detected plate (editable)
                      </label>
                      <input
                        value={plateInput}
                        onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                        className="w-full bg-[#141c0e] border border-[#8b6f2e]/30 rounded-lg px-3 py-2.5 font-extrabold tracking-widest"
                        placeholder="e.g. 0012 AB 3456"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-[#a89a76] font-bold mb-1 block">
                        Gate direction
                      </label>
                      <select value={direction} onChange={(e) => setDirection(e.target.value)} className={selectCls}>
                        <option value="auto">Auto (flip current state)</option>
                        <option value="out">OUT (vehicle leaving MT park)</option>
                        <option value="in">IN (vehicle returning)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-[#a89a76] font-bold mb-1 block">
                      Match to fleet vehicle
                    </label>
                    <select
                      value={vehicleId}
                      onChange={(e) => setVehicleId(Number(e.target.value))}
                      className={selectCls}
                    >
                      <option value="">— Select vehicle —</option>
                      {rec.matches?.length > 0 && (
                        <optgroup label="ANPR matches">
                          {rec.matches.map((m) => (
                            <option key={m.vehicleId} value={m.vehicleId}>
                              {m.regNo} · {m.type} ({Math.round(m.score * 100)}% match)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="All vehicles">
                        {fleet.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.regNo} · {v.type} · {v.parkStatus === "out" ? "OUT" : "IN"}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={reset} className="flex-1 py-2.5 border border-[#8b6f2e]/50 text-[#d4c48a] font-extrabold rounded-lg text-sm">
                      RETAKE
                    </button>
                    <button
                      onClick={confirm}
                      disabled={confirming || !vehicleId}
                      className="flex-1 py-2.5 bg-[#8b6f2e] text-[#1a1508] font-extrabold rounded-lg text-sm disabled:opacity-40"
                    >
                      {confirming ? "LOGGING SCAN…" : "CONFIRM IN/OUT SCAN"}
                    </button>
                  </div>
                </div>
              )}

              {/* ---------- multiple photos ---------- */}
              {batch.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-extrabold tracking-widest text-[#d4c48a]">
                      {batch.length} PHOTOS · {doneCount} LOGGED
                    </div>
                    <div className="w-48">
                      <select
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                        className={selectCls + " !py-1.5 text-xs"}
                        aria-label="Gate direction for all photos"
                      >
                        <option value="auto">Auto (flip current state)</option>
                        <option value="out">All OUT</option>
                        <option value="in">All IN</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {batch.map((it) => (
                      <div key={it.id} className="rounded-xl border border-[#8b6f2e]/25 bg-[#141c0e] p-2.5 flex gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.preview} alt={it.name} className="w-24 h-20 object-cover rounded-lg border border-[#8b6f2e]/25 shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-[#8b8064] truncate">{it.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              {it.status === "reading" && (
                                <span className="text-[10px] font-bold text-[#d4c48a] flex items-center gap-1">
                                  <Loader2 size={11} className="animate-spin" /> Reading…
                                </span>
                              )}
                              {it.status === "logging" && (
                                <span className="text-[10px] font-bold text-[#d4c48a] flex items-center gap-1">
                                  <Loader2 size={11} className="animate-spin" /> Logging…
                                </span>
                              )}
                              {it.status === "done" && (
                                <span className="text-[10px] font-extrabold text-emerald-300 flex items-center gap-1">
                                  <CheckCircle2 size={12} /> {it.msg}
                                </span>
                              )}
                              {it.status === "ready" && it.rec && (
                                <span className="text-[10px] font-bold text-[#d4c48a]">{it.rec.confidence}%</span>
                              )}
                              {it.status !== "logging" && it.status !== "done" && (
                                <button
                                  onClick={() => removeItem(it.id)}
                                  className="text-[#6d5f45] hover:text-rose-300"
                                  aria-label="Remove photo"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>

                          {it.status === "error" && (
                            <p className="text-[11px] text-rose-300 flex items-start gap-1">
                              <XCircle size={12} className="mt-0.5 shrink-0" /> {it.msg}
                            </p>
                          )}

                          {(it.status === "ready" || it.status === "error") && (
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                value={it.plate}
                                onChange={(e) => patchItem(it.id, { plate: e.target.value.toUpperCase() })}
                                placeholder="Plate"
                                className="w-full bg-[#0e1409] border border-[#8b6f2e]/30 rounded-md px-2 py-1.5 text-xs font-extrabold tracking-wider"
                              />
                              <select
                                value={it.vehicleId}
                                onChange={(e) =>
                                  patchItem(it.id, {
                                    vehicleId: e.target.value ? Number(e.target.value) : "",
                                    status: "ready",
                                    msg: undefined,
                                  })
                                }
                                className="w-full bg-[#0e1409] border border-[#8b6f2e]/30 rounded-md px-1.5 py-1.5 text-xs font-bold"
                              >
                                <option value="">— Vehicle —</option>
                                {it.rec?.matches?.length ? (
                                  <optgroup label="ANPR matches">
                                    {it.rec.matches.map((m) => (
                                      <option key={m.vehicleId} value={m.vehicleId}>
                                        {m.regNo} ({Math.round(m.score * 100)}%)
                                      </option>
                                    ))}
                                  </optgroup>
                                ) : null}
                                <optgroup label="All vehicles">
                                  {fleet.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.regNo} · {v.parkStatus === "out" ? "OUT" : "IN"}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={batchRunning}
                      className="flex-1 min-w-[120px] py-2.5 border border-[#8b6f2e]/50 text-[#d4c48a] font-extrabold rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <UploadCloud size={13} /> ADD MORE
                    </button>
                    <button
                      onClick={reset}
                      disabled={batchRunning}
                      className="flex-1 min-w-[120px] py-2.5 border border-[#8b6f2e]/50 text-[#d4c48a] font-extrabold rounded-lg text-xs disabled:opacity-40"
                    >
                      CLEAR ALL
                    </button>
                    {doneCount > 0 && readyCount === 0 ? (
                      <button
                        onClick={close}
                        className="flex-[2] min-w-[160px] py-2.5 bg-[#8b6f2e] text-[#1a1508] font-extrabold rounded-lg text-xs"
                      >
                        DONE
                      </button>
                    ) : (
                      <button
                        onClick={logAll}
                        disabled={batchRunning || readyCount === 0}
                        className="flex-[2] min-w-[160px] py-2.5 bg-[#8b6f2e] text-[#1a1508] font-extrabold rounded-lg text-xs disabled:opacity-40"
                      >
                        {batchRunning ? "WORKING…" : `CONFIRM ${readyCount} SCAN${readyCount === 1 ? "" : "S"}`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {resultMsg && (
                <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-lg px-3 py-2">
                  {resultMsg}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
