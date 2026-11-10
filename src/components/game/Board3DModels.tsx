"use client";

import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { UnitModel, type ModelId } from "@/lab/arena3d/UnitModel";

export type BoardModel = {
  key: string;
  model: ModelId;
  position: [number, number, number];
  scale: number;
  rotationY?: number;
  actionKey?: string;
};

function Models({
  models,
  animationMode,
  onReady,
  onError,
}: {
  models: BoardModel[];
  animationMode?: "board" | "combat";
  // The model is reported alongside the key because readiness belongs to the
  // MODEL, not to the board slot holding it — see game/data/model-ready.ts.
  onReady: (key: string, model: ModelId) => void;
  onError: (key: string, model: ModelId, error: Error) => void;
}) {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[0, 240, 280]} intensity={2} />
      {models.map((entry) => (
        <ModelErrorBoundary key={entry.key} modelKey={entry.key} model={entry.model} onError={onError}>
          <Suspense fallback={null}>
            <group position={entry.position} scale={entry.scale} rotation-y={entry.rotationY ?? 0}>
              <UnitModel
                id={entry.model}
                position={[0, 0, 0]}
                dragging={false}
                actionKey={entry.actionKey}
                animationMode={animationMode}
                onLoaded={() => onReady(entry.key, entry.model)}
              />
            </group>
          </Suspense>
        </ModelErrorBoundary>
      ))}
    </>
  );
}

class ModelErrorBoundary extends Component<
  { children: ReactNode; modelKey: string; model: ModelId; onError: (key: string, model: ModelId, error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(this.props.modelKey, this.props.model, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Board3DModels({
  models,
  height,
  perspective,
  animationMode,
  onReady,
  onError,
}: {
  models: BoardModel[];
  height: number;
  perspective: number;
  animationMode?: "board" | "combat";
  onReady: (key: string, model: ModelId) => void;
  onError: (key: string, model: ModelId, error: Error) => void;
}) {
  const fov = (2 * Math.atan(height / (2 * perspective)) * 180) / Math.PI;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.35]}
        gl={{ alpha: true, antialias: true }}
        camera={{
          position: [0, 0, perspective],
          fov,
          near: 0.1,
          far: perspective * 3,
        }}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <Models models={models} animationMode={animationMode} onReady={onReady} onError={onError} />
      </Canvas>
    </div>
  );
}
