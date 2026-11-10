"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The one button in the app.
 *
 * There were 140 `<button>` elements across 32 files. Two of them used the
 * `.btn-primary` class that globals.css defines for exactly this purpose, and
 * `.btn-ghost` was used zero times — it had been written and then never
 * adopted, so it sat in the stylesheet as dead code while every screen
 * hand-wrote its own spacing, radius, weight and hover state. Sampling the
 * long class strings turns up almost no repeats: `px-6 py-2.5` next to
 * `px-4 py-2` next to `px-3 py-1.5`, `rounded-lg` next to `rounded-md`, four
 * different hover colours for what is visually the same close button.
 *
 * The four variants below are not invented — they are what the hand-written
 * buttons already clustered into once you group them.
 */

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  /** The single affirmative action on a screen. Brand gold, dark text. */
  primary:
    "bg-gold-500 hover:bg-gold-300 text-black border border-gold-300/55 " +
    "disabled:bg-slate-500/12 disabled:text-slate-400/50 disabled:border-white/[0.06]",
  /** Everything secondary. Reads as a button without competing with primary. */
  ghost:
    "bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 hover:text-slate-100 " +
    "border border-white/[0.09] disabled:opacity-45",
  /** Destructive or exit actions. Neutral until hovered, so it is not alarming at rest. */
  danger:
    "bg-white/[0.03] hover:bg-rose-900/55 text-slate-300 hover:text-rose-100 " +
    "border border-white/[0.09] hover:border-rose-500/40 disabled:opacity-45",
  /** Bare text / icon button — no chrome. Replaces the four close-X spellings. */
  subtle:
    "bg-transparent text-slate-500 hover:text-gold-300 border border-transparent disabled:opacity-45",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-[11px] rounded-md gap-1.5",
  md: "px-4 py-2 text-xs rounded-lg gap-2",
  lg: "px-6 py-2.5 text-sm rounded-lg gap-2",
};

// `subtle` carries no chrome, so the box padding of a sized button would only
// add dead click-space around a glyph.
const SUBTLE_SIZES: Record<Size, string> = {
  sm: "text-[11px] gap-1.5",
  md: "text-xs gap-2",
  lg: "text-sm gap-2",
};

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizing = variant === "subtle" ? SUBTLE_SIZES[size] : SIZES[size];
  return (
    <button
      className={
        "inline-flex items-center justify-center font-bold transition-colors " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 " +
        "disabled:cursor-not-allowed " +
        `${VARIANTS[variant]} ${sizing} ${className}`
      }
      {...rest}
    >
      {children}
    </button>
  );
}
