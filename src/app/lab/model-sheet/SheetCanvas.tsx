"use client";

import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
// No fitToWidth: the pose lab omits it, and fitting to WIDTH scales a
// wide-bodied model (Rattata, the Charizard line) until the camera sits inside
// the mesh — which reads as a blank or solid-white cell, i.e. a working model
// looking broken. Height normalisation is UnitModel's default.
import { MODEL_TARGET_HEIGHT, UnitModel } from "@/lab/arena3d/UnitModel";

/**
 * One cell of the contact sheet.
 *
 * Deliberately NOT PokemonModelPreview: that lazy-loads behind an
 * IntersectionObserver, so a grid of them would leave most cells blank in a
 * headless screenshot. Here every cell mounts eagerly and reports when it has
 * settled, so the harness can wait for the whole page rather than guess.
 */

class CellBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function SheetCanvas({
  dex,
  yaw,
  onSettled,
}: {
  dex: number;
  /** Trial rotation applied to every model on the sheet, in radians. */
  yaw: number;
  onSettled: (state: "ok" | "err") => void;
}) {
  return (
    <CellBoundary onError={() => onSettled("err")}>
      <Canvas
        // "always", not "demand": on demand a cell only repaints when something
        // invalidates it, and the first cells to finish loading settled before
        // their final normalisation pass ever requested a frame — leaving blank
        // or half-drawn cells that look exactly like broken models. A triage
        // sheet must never make a working model look broken.
        frameloop="always"
        dpr={[1, 1.25]}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        // The trial yaw orbits the CAMERA, not the model. Wrapping the model in
        // a rotated group disturbed UnitModel's own bounds normalisation (it
        // measures the cloned skeleton to fit a target height), which left some
        // models scaled so large the camera sat inside the mesh — a solid white
        // cell that reads exactly like a broken model. Orbiting the camera is
        // visually equivalent for judging facing and cannot touch the model.
        camera={{ position: [Math.sin(yaw) * 1.7, 0, Math.cos(yaw) * 1.7], fov: 34, near: 0.1, far: 20 }}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={1.6} />
          <directionalLight position={[2, 4, 5]} intensity={2.2} />
          <UnitModel
              id={dex}
              position={[0, -MODEL_TARGET_HEIGHT / 2, 0]}
              dragging={false}
              // Matches the in-game preview, which passes this. Height alone is
              // normalised by UnitModel; without the width clamp a low, wide
              // creature (Rattata, Ninetales, Paras) scales up until it
              // overflows its frame — which looks like a broken model but is
              // only this sheet disagreeing with how the game actually renders.
              // The pose lab omits it, so the lab shows models wider than the
              // game does.
              fitToWidth={MODEL_TARGET_HEIGHT}
            onLoaded={() => onSettled("ok")}
          />
        </Suspense>
      </Canvas>
    </CellBoundary>
  );
}
