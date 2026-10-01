"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, UploadCloud, X, ScanLine, ShieldCheck, AlertTriangle } from "lucide-react";

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
    } catch (e: any) {
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

  const reset = () => {
    setRec(null);
    setPreview(null);
    setFile(null);
    setPlateInput("");
    setVehicleId("");
    setResultMsg(null);
    setBusy(false);
  };

  const close = () => {
    stopCamera();
    reset();
    setOpen(false);
  };

  const acceptImage = async (blob: Blob, dataUrl: string) => {
    setFile(blob);
    setPreview(dataUrl);
    setRec(null);
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
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      acceptImage(blob, url);
    }, "image/jpeg", 0.85);
  };

  const onFile = (f?: File | null) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    acceptImage(f, url);
  };

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
              {!rec && (
                <>
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
                        {m === "camera" ? "Live camera" : "Upload photo"}
                      </button>
                    ))}
                  </div>

                  {mode === "camera" && (
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

                  {mode === "upload" && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full border-2 border-dashed border-[#8b6f2e]/50 rounded-xl py-12 flex flex-col items-center gap-2 text-[#a89a76] hover:border-[#c0a86c] hover:text-[#d4c48a] transition"
                    >
                      <UploadCloud size={30} />
                      <span className="text-sm font-bold">Tap to choose a gate photograph</span>
                      <span className="text-[10px]">JPEG / PNG from the entrance camera</span>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onFile(e.target.files?.[0])}
                      />
                    </button>
                  )}
                </>
              )}

              {busy && (
                <div className="py-10 text-center">
                  <ScanLine size={34} className="mx-auto text-[#d4c48a] animate-pulse mb-2" />
                  <p className="text-sm font-bold">Analysing photograph and reading the number plate…</p>
                </div>
              )}

              {rec && preview && (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden border border-[#8b6f2e]/30">
                    <img src={rec.thumbDataUrl || preview} alt="gate capture" className="w-full max-h-72 object-cover mx-auto" />
                    {plateInput && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/85 border-2 border-[#d4c48a] px-4 py-1.5 rounded font-black tracking-[0.25em] text-lg text-[#f3e7c0]">
                        {plateInput}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="px-2 py-1 rounded-md bg-[#20301a] border border-emerald-600/40 text-emerald-300 font-extrabold flex items-center gap-1">
                      <ShieldCheck size={12} /> ANPR: {(rec as any).engine === "plate-recognizer" ? "Cloud" : "On-board OCR"}
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
                      <select
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                        className="w-full bg-[#141c0e] border border-[#8b6f2e]/30 rounded-lg px-3 py-2.5 font-bold"
                      >
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
                      className="w-full bg-[#141c0e] border border-[#8b6f2e]/30 rounded-lg px-3 py-2.5 font-bold"
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

              {resultMsg && <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-lg px-3 py-2">{resultMsg}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
