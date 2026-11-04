"use client";

import dynamic from "next/dynamic";

/** Client-only: three.js touches WebGL/window on import, and this route is a
 *  spike — keeping it out of the server bundle also keeps it out of the game's. */
const Arena3D = dynamic(() => import("@/lab/arena3d/Arena3D").then((m) => m.Arena3D), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 grid place-items-center bg-[#070c17] text-slate-500 text-sm">
      loading arena…
    </div>
  ),
});

export default function Arena3DPage() {
  return <Arena3D />;
}
