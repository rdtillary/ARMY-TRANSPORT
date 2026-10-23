"use client";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { useState } from "react";

/** <PasskeyLoginButton /> on the admin login screen.
 *  <PasskeyRegisterButton /> in the admin settings/profile (must be logged in). */
export function PasskeyLoginButton({ onSuccess }: { onSuccess?: () => void }) {
  const [msg, setMsg] = useState("");
  async function go() {
    setMsg("");
    try {
      const opts = await (await fetch("/api/passkey/login")).json();
      const response = await startAuthentication({ optionsJSON: opts });
      const r = await fetch("/api/passkey/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!r.ok) return setMsg("Passkey login failed");
      onSuccess ? onSuccess() : location.reload();
    } catch (e: any) { setMsg(e?.name === "NotAllowedError" ? "Cancelled" : "Passkey error"); }
  }
  return <div><button type="button" onClick={go}>Sign in with passkey</button>{msg && <p>{msg}</p>}</div>;
}

export function PasskeyRegisterButton() {
  const [msg, setMsg] = useState("");
  async function go() {
    setMsg("");
    try {
      const opts = await (await fetch("/api/passkey/register")).json();
      if (opts.error) return setMsg(opts.error);
      const response = await startRegistration({ optionsJSON: opts });
      const r = await fetch("/api/passkey/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, label: navigator.platform }),
      });
      setMsg(r.ok ? "Passkey added" : "Could not add passkey");
    } catch (e: any) { setMsg(e?.name === "NotAllowedError" ? "Cancelled" : "Passkey error"); }
  }
  return <div><button type="button" onClick={go}>Add passkey</button>{msg && <p>{msg}</p>}</div>;
}
