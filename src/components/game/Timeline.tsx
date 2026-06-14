"use client";

import { useGame } from "@/game/store/gameStore";
import { roundKind, roundsInStage, type RoundKind } from "@/game/config";
import { SwordIcon, PawIcon, GiftIcon } from "./icons";

function KindIcon({ kind }: { kind: RoundKind }) {
  if (kind === "pve") return <PawIcon size={13} />;
  if (kind === "carousel") return <GiftIcon size={13} />;
  return <SwordIcon size={13} />;
}

export function Timeline() {
  const stage = useGame((s) => s.stage);
  const round = useGame((s) => s.round);
  const history = useGame((s) => s.history);

  // Show the current stage's rounds + the next stage's first three as a preview.
  const cells: { stage: number; round: number; kind: RoundKind }[] = [];
  for (let r = 1; r <= roundsInStage(stage); r++) cells.push({ stage, round: r, kind: roundKind(stage, r) });
  for (let r = 1; r <= 3; r++) cells.push({ stage: stage + 1, round: r, kind: roundKind(stage + 1, r) });

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/40 overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">Round</span>
      <div className="flex items-center gap-1">
        {cells.map((c, i) => {
          const rec = history.find((h) => h.stage === c.stage && h.round === c.round);
          const isCurrent = c.stage === stage && c.round === round && !rec;
          const newStage = c.round === 1;

          let bg = "bg-slate-800/60 text-slate-500 border-slate-700/60";
          if (rec?.outcome === "win") bg = "bg-emerald-500/90 text-black border-emerald-400";
          else if (rec?.outcome === "loss") bg = "bg-rose-500/90 text-black border-rose-400";
          else if (rec?.outcome === "pve") bg = "bg-sky-500/80 text-black border-sky-400";
          else if (rec?.outcome === "carousel") bg = "bg-amber-400/90 text-black border-amber-300";
          else if (c.kind === "pve") bg = "bg-slate-800/60 text-sky-300/80 border-sky-700/40";
          else if (c.kind === "carousel") bg = "bg-slate-800/60 text-amber-300/80 border-amber-700/40";

          return (
            <div key={i} className="flex items-center">
              {newStage && i !== 0 && <div className="w-px h-6 bg-slate-700 mx-1" />}
              <div
                title={`${c.stage}-${c.round} · ${c.kind}`}
                className={`relative flex items-center justify-center w-7 h-7 rounded-md border ${bg} ${isCurrent ? "ring-2 ring-sky-400" : ""}`}
              >
                <KindIcon kind={c.kind} />
                {isCurrent && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-400" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
