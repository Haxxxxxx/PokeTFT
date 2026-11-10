"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { spriteUrl } from "@/game/data/mons";
import { hasUsable3DModel } from "@/game/data/model-availability";

const PokemonModelPreviewCanvas = dynamic(
  () => import("./PokemonModelPreviewCanvas").then((module) => module.PokemonModelPreviewCanvas),
  { ssr: false, loading: () => null },
);

/**
 * A Pokémon portrait. Renders the SPRITE unless a 3D model is explicitly asked
 * for.
 *
 * It used to render a model whenever one existed, which meant one WebGL canvas
 * per instance, everywhere, regardless of the models3d setting — the 8-player
 * rail, the trait grids, match history, the drag ghost. Browsers cap live WebGL
 * contexts (the model sheet proved eviction blanks everything past about a
 * dozen), so a busy screen quietly lost its portraits, and the match showed 3D
 * in some places and 2D in others at the same time.
 *
 * Models are not the default renderer and have not been since #119. Opting in
 * is now explicit, so a portrait cannot silently cost a WebGL context.
 */
export function PokemonModelPreview({
  dex,
  alt,
  width,
  height = width,
  className,
  style,
  imageClassName,
  imageStyle,
  model = false,
}: {
  dex: number;
  alt: string;
  width: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  imageClassName?: string;
  imageStyle?: CSSProperties;
  /** Opt in to the 3D model. Costs a WebGL context — use only for large art. */
  model?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(function observeModelPreview() {
    const host = hostRef.current;
    if (!host) return;
    if (!model) return;
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(host);
    return function stopObservingModelPreview() {
      observer.disconnect();
    };
  }, [model]);

  const handleLoaded = useCallback(() => setLoaded(true), []);
  const handleError = useCallback((error: Error) => {
    console.error(`3D preview for National Dex ${dex} failed to load; keeping its sprite visible.`, error);
    setFailed(true);
  }, [dex]);

  return (
    <span
      ref={hostRef}
      role="img"
      aria-label={alt}
      className={`relative inline-block shrink-0 overflow-visible pointer-events-none ${className ?? ""}`}
      style={{ width, height, ...style }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={spriteUrl(dex)}
        alt=""
        aria-hidden
        width={width}
        height={height}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${imageClassName ?? ""}`}
        style={{ imageRendering: "pixelated", opacity: loaded && !failed ? 0 : 1, ...imageStyle }}
        draggable={false}
      />
      {model && visible && !failed && hasUsable3DModel(dex) && (
        <PokemonModelPreviewCanvas dex={dex} onLoaded={handleLoaded} onError={handleError} />
      )}
    </span>
  );
}
