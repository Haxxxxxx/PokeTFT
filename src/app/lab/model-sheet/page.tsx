"use client";

/**
 * Contact sheet for pose triage.
 *
 * The pose reviewer at /lab/model-poses is a single-model editor — the right
 * tool for FIXING a stance, the wrong one for deciding which of 967 stances are
 * even broken. Reviewing them one at a time is the reason the baked map has
 * three entries.
 *
 * This renders a page of models beside their own sprites at a fixed camera, so
 * a whole batch can be judged at once and only the broken ones go to the
 * editor. `yaw` applies a trial rotation to EVERY model on the page, which is
 * what makes it possible to tell a systematic facing problem (one default,
 * fixed once) apart from a per-species one.
 *
 *   /lab/model-sheet?from=1&count=24&yaw=-34
 */

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { spriteUrl } from "@/game/data/mons";
import { hasUsable3DModel } from "@/game/data/model-availability";

const SheetCanvas = dynamic(
  () => import("./SheetCanvas").then((m) => m.SheetCanvas),
  { ssr: false, loading: () => null },
);

function Sheet() {
  const params = useSearchParams();
  const from = Math.max(1, Number(params.get("from") ?? 1));
  // Hard cap of 12. Each cell is its own WebGL context and browsers evict the
  // OLDEST once a page exceeds roughly 16 — which silently blanked the FIRST
  // cells of a 24-model sheet and made eight working models look broken.
  const count = Math.min(12, Math.max(1, Number(params.get("count") ?? 12)));
  const yaw = Number(params.get("yaw") ?? 0);
  const [ready, setReady] = useState<Record<number, "ok" | "err">>({});

  const dexes = useMemo(() => {
    const out: number[] = [];
    for (let d = from; out.length < count && d <= 1025; d++) {
      if (hasUsable3DModel(d)) out.push(d);
    }
    return out;
  }, [from, count]);

  const done = dexes.filter((d) => ready[d]).length;

  return (
    <div className="min-h-screen bg-[#070c17] text-slate-200 p-4">
      <div className="mb-3 flex items-baseline gap-3 text-xs font-bold">
        <span className="text-amber-300">MODEL SHEET</span>
        <span className="text-slate-400">dex {dexes[0]}–{dexes[dexes.length - 1]} · {dexes.length} models · yaw {yaw}°</span>
        {/* The harness waits on this, so it must only reach 100% once every
            model has either rendered or failed. */}
        <span data-sheet-progress={`${done}/${dexes.length}`} className="text-slate-500">
          loaded {done}/{dexes.length}
        </span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
        {dexes.map((dex) => (
          <div key={dex} className="relative rounded-lg bg-slate-900/50 border border-white/10 overflow-hidden" style={{ height: 180 }}>
            <span className="absolute top-1 left-1.5 z-10 text-[10px] font-extrabold text-amber-300/90">{dex}</span>
            {/* The sprite is the reference the model has to match: it shows the
                species' canonical facing and stance. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={spriteUrl(dex)}
              alt=""
              width={48}
              height={48}
              className="absolute top-1 right-1 z-10 opacity-80"
              style={{ imageRendering: "pixelated" }}
            />
            <div className="absolute inset-0">
              <SheetCanvas
                dex={dex}
                yaw={(yaw * Math.PI) / 180}
                onSettled={(state) => setReady((r) => (r[dex] ? r : { ...r, [dex]: state }))}
              />
            </div>
            {ready[dex] === "err" && (
              <span className="absolute bottom-1 left-1.5 text-[9px] font-bold text-rose-400">model failed</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ModelSheetPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#070c17] text-slate-400">Loading sheet…</div>}>
      <Sheet />
    </Suspense>
  );
}
