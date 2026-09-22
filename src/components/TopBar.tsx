"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { clearSession } from "@/lib/session";
import McteLogo from "@/components/McteLogo";

export default function TopBar({
  role,
  name,
  unit,
}: {
  role: string;
  name: string;
  unit?: string;
}) {
  const router = useRouter();
  const logout = () => {
    clearSession();
    router.replace("/");
  };
  return (
    <header className="sticky top-0 z-[800] bg-[#1a2215]/95 backdrop-blur border-b border-[#8b6f2e]/25">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <McteLogo size={30} className="shrink-0 drop-shadow-[0_2px_8px_rgba(69,137,227,0.35)]" />
          <div className="min-w-0">
            <div className="font-extrabold leading-none tracking-tight text-[#eee8d0] truncate">
              AI TRANSPORT
              <span className="hidden md:inline text-[10px] font-bold tracking-[0.25em] text-[#8fb4e8] ml-2 align-middle">
                MCTE
              </span>
            </div>
            <div className="text-[10px] text-[#b5aa88] uppercase tracking-widest mt-0.5">
              {role} TERMINAL • SECURE
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-sm font-bold text-[#eee8d0] leading-tight truncate max-w-[180px]">{name}</div>
            <div className="text-[10px] text-[#b5aa88] uppercase tracking-wider">{unit}</div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs font-bold text-[#a8987a] hover:text-[#eee8d0] bg-[#2a361d] px-3 py-2 rounded-lg border border-[#8b6f2e]/25 transition-colors"
          >
            <LogOut size={13} /> LOGOUT
          </button>
        </div>
      </div>
    </header>
  );
}
