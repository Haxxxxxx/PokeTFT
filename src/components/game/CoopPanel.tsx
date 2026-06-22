"use client";

import { useState } from "react";
import { useGame } from "@/game/store/gameStore";
import { syncBoard } from "@/game/net/match";
import { sendGold, sendUnit } from "@/game/net/coop";
import { getDef, spriteUrl } from "@/game/data/mons";
import { Users, Coins, Send } from "lucide-react";

/** Double Up co-op controls: hand gold or a bench unit to your partner. The "help your
 *  partner when you finish early" flow — once your board's set, ship your spares over.
 *  Lives behind the partner HUD chip as an expandable popover. */
export function CoopPanel({ code, myUid, partner, lang }: {
  code: string; myUid: string;
  partner: { uid: string; name: string; hp: number; alive: boolean };
  lang: string;
}) {
  const [open, setOpen] = useState(false);
  const gold = useGame((s) => s.gold);
  const units = useGame((s) => s.units);
  const bench = units.filter((u) => u.pos === null);
  const fr = lang === "fr";

  // Push my reduced econ to the room right after a send so a reload reflects it.
  const syncMine = () => {
    const g = useGame.getState();
    syncBoard(code, myUid, g.units, g.exportSave(), g.level, g.augments);
  };
  const giveGold = (amount: number) => {
    const spent = useGame.getState().coopSpendGold(amount);
    if (spent > 0) { sendGold(code, partner.uid, myUid, spent).catch(() => {}); syncMine(); }
  };
  const giveUnit = (iid: string) => {
    const snap = useGame.getState().coopRemoveUnit(iid);
    if (snap) { sendUnit(code, partner.uid, myUid, snap).catch(() => {}); syncMine(); }
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title={fr ? "Coopération — envoyer or/unités à ton partenaire" : "Co-op — send gold/units to your partner"}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${open ? "border-emerald-400 bg-emerald-900/60" : "border-emerald-500/50 bg-emerald-900/30 hover:bg-emerald-900/50"} text-emerald-200`}
      >
        <Users size={13} />
        <span className="text-[11px] font-bold truncate max-w-[80px]">{partner.name}</span>
        <span className="text-[11px] font-extrabold tabular-nums text-emerald-300">{Math.max(0, partner.hp)}♥</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 right-0 w-64 max-w-[82vw] rounded-xl border border-emerald-500/40 bg-[#0d1426] shadow-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-extrabold text-emerald-300 uppercase tracking-wide">{fr ? "Aider mon partenaire" : "Help your partner"}</h3>
              <span className="text-[10px] text-slate-500">{partner.name}</span>
            </div>

            {/* Send gold */}
            <div className="mb-2.5">
              <div className="text-[9px] uppercase tracking-wide text-emerald-200/60 font-bold mb-1.5">{fr ? "Envoyer de l'or" : "Send gold"}</div>
              <div className="flex gap-1.5">
                {[1, 5, 10].map((n) => (
                  <button key={n} disabled={gold < n || !partner.alive} onClick={() => giveGold(n)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-amber-900/30 border border-amber-600/40 text-amber-200 text-[11px] font-bold disabled:opacity-30 hover:bg-amber-900/50">
                    <Coins size={11} />{n}
                  </button>
                ))}
              </div>
            </div>

            {/* Send a bench unit */}
            <div>
              <div className="text-[9px] uppercase tracking-wide text-emerald-200/60 font-bold mb-1.5">{fr ? "Envoyer une unité (banc)" : "Send a bench unit"}</div>
              {bench.length === 0 ? (
                <p className="text-[10px] text-slate-500">{fr ? "Banc vide." : "Bench is empty."}</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
                  {bench.map((u) => {
                    const def = getDef(u.defId);
                    return (
                      <div key={u.iid} className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-700/60 bg-slate-800/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={spriteUrl(def.dex[u.star - 1])} alt="" width={26} height={26} style={{ imageRendering: "pixelated" }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-bold text-slate-200 truncate">{def.stageNames[u.star - 1]}</div>
                          <div className="text-[9px] text-amber-300/80">{"★".repeat(u.star)}{u.items?.length ? ` · ${u.items.length} ${fr ? "objet" : "item"}${u.items.length > 1 ? "s" : ""}` : ""}</div>
                        </div>
                        <button disabled={!partner.alive} onClick={() => giveUnit(u.iid)} title={fr ? "Envoyer" : "Send"}
                          className="shrink-0 w-7 h-7 rounded-md bg-emerald-900/40 hover:bg-emerald-700 border border-emerald-600/50 text-emerald-200 flex items-center justify-center disabled:opacity-30">
                          <Send size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
