import { GameClient } from "@/components/game/GameClient";
import { PokeballIcon } from "@/components/game/icons";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b1020] text-slate-100">
      <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <span className="text-rose-500"><PokeballIcon size={20} /></span>
        <h1 className="font-extrabold tracking-tight">
          Poké<span className="text-amber-400">TFT</span>
        </h1>
        <span className="text-xs text-slate-500 ml-2">Gen 1 · Phase 1 prototype</span>
      </header>
      <GameClient />
    </main>
  );
}
