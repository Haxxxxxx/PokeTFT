"use client";

import dynamic from "next/dynamic";

const ModelPoseLab = dynamic(
  () => import("@/lab/arena3d/ModelPoseLab").then((module) => module.ModelPoseLab),
  { ssr: false, loading: () => <div className="grid min-h-screen place-items-center bg-[#070c17] text-slate-400">Loading pose reviewer…</div> },
);

export default function ModelPosesPage() {
  return <ModelPoseLab />;
}
