"use client";

import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { MODEL_TARGET_HEIGHT, UnitModel } from "@/lab/arena3d/UnitModel";

function Model({
  dex,
  onLoaded,
}: {
  dex: number;
  onLoaded: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <ambientLight intensity={1.6} />
      <directionalLight position={[2, 4, 5]} intensity={2.2} />
      <UnitModel
        id={dex}
        position={[MODEL_TARGET_HEIGHT * 0.1, -MODEL_TARGET_HEIGHT / 2, 0]}
        dragging={false}
        fitToWidth={MODEL_TARGET_HEIGHT}
        onLoaded={onLoaded}
      />
    </Suspense>
  );
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function PokemonModelPreviewCanvas({
  dex,
  onLoaded,
  onError,
}: {
  dex: number;
  onLoaded: () => void;
  onError: (error: Error) => void;
}) {
  return (
    <PreviewErrorBoundary onError={onError}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.25]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 1.7], fov: 34, near: 0.1, far: 20 }}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <Model dex={dex} onLoaded={onLoaded} />
      </Canvas>
    </PreviewErrorBoundary>
  );
}
