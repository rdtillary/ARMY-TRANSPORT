"use client";
// → replace src/components/PasskeyButtons.tsx
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useState } from "react";
import { Fingerprint } from "lucide-react";
import type { Session } from "@/lib/session";

const btn =
  "w-full flex items-center justify-center gap-2 py-3 border border-[#8b6f2e]/60 text-[#d4c48a] font-extrabold rounded-xl text-sm hover:bg-[#8b6f2e]/15 transition";

/** Admin login screen: Face ID / fingerprint / device PIN. Calls onSuccess(session). */
export function PasskeyLoginButton({ onSuccess }: { onSuccess: (s: Session) => void }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setMsg("");
    if (!browserSupportsWebAuthn()) return setMsg("Passkeys are not supported on this device/browser");
    setBusy(true);
    try {
      const opts = await (await fetch("/api/passkey/login")).json();
      const response = await startAuthentication({ optionsJSON: opts });
      const r = await fetch("/api/passkey/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setMsg(d.error || "Passkey login failed");
      onSuccess(d as Session);
    } catch (e: any) {
      setMsg(e?.name === "NotAllowedError" ? "Cancelled" : "Passkey error");
    } finally { setBusy(false); }
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className={btn}>
        <Fingerprint size={16} /> {busy ? "WAITING…" : "SIGN IN WITH FACE ID / FINGERPRINT"}
      </button>
      {msg && <p className="text-xs text-rose-300 mt-2 text-center">{msg}</p>}
    </div>
  );
}

/** Admin terminal (must be logged in): registers this device's biometric/PIN. */
export function PasskeyRegisterButton() {
  const [msg, setMsg] = useState("");
  async function go() {
    setMsg("");
    if (!browserSupportsWebAuthn()) return setMsg("Passkeys are not supported on this device/browser");
    try {
      const opts = await (await fetch("/api/passkey/register")).json();
      if (opts.error) return setMsg(opts.error);
      const response = await startRegistration({ optionsJSON: opts });
      const r = await fetch("/api/passkey/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, label: navigator.platform }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? "✔ Passkey added on this device" : d.error || "Could not add passkey");
    } catch (e: any) {
      setMsg(e?.name === "NotAllowedError" ? "Cancelled" : e?.name === "InvalidStateError" ? "This device already has a passkey" : "Passkey error");
    }
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button" onClick={go}
        className="flex items-center gap-1.5 text-xs font-extrabold px-3.5 py-2 rounded-lg border bg-[#2a361d] border-[#8b6f2e]/40 text-[#d4c48a] hover:bg-[#33421f] transition"
      >
        <Fingerprint size={13} /> ADD PASSKEY
      </button>
      {msg && <span className="text-[11px] text-[#d4c48a]">{msg}</span>}
    </div>
  );
}
