"use client";

import { useId } from "react";
import { useGame } from "@/game/store/gameStore";
import { ECONOMY } from "@/game/config";
import { interest } from "@/game/engine/economy";
import { useT } from "@/lib/i18n";

/**
 * Interest, as a stack of Poké Balls down the left of the board.
 *
 * It used to be "+3" in 10px type under the gold counter — a number you had to
 * already understand to read. Interest is the single biggest lever in the
 * economy and it is a STEP function: one gold per ten banked, capped at five.
 * The thing a player actually wants to know mid-round is not the current value
 * but how close the next ball is, and a number cannot show that without being
 * read and divided.
 *
 * So: one ball per gold of interest, at the size of a mon, with the remaining
 * capacity drawn as empty slots. The stack fills as you bank, and the cap is
 * visible as the slots that are still empty — which is the whole decision
 * (bank to the next ten, or spend) expressed as a shape instead of arithmetic.
 *
 * The next ball also carries a fill ring showing progress toward it, so the
 * gold between breakpoints is not dead space.
 */
export function IncomeBalls({ size, inset }: { size: number; inset: number }) {
  const gold = useGame((s) => s.gold);
  const t = useT();

  const earned = interest(gold);
  const cap = ECONOMY.interestCap;
  // Progress toward the NEXT ball, 0..1. At the cap there is no next one, and
  // showing a half-filled ring that can never complete would be a lie.
  const toNext = earned >= cap ? 0 : (gold % ECONOMY.interestPer) / ECONOMY.interestPer;

  // Overlap, so it reads as a stack rather than a column of separate balls.
  // Bottom ball is the first earned, so the pile grows upward as you bank.
  const step = size * 0.58;
  const height = size + step * (cap - 1);

  return (
    <div
      aria-label={t.net_interest_label}
      // Test hooks. The stack is the only readout for interest now that the
      // "+N" is gone, so a probe has to be able to check it against the gold
      // it claims to describe — see tools/probe-income.mjs.
      data-income={earned}
      data-income-cap={cap}
      title={`${t.net_interest_label} +${earned}`}
      className="pointer-events-none absolute z-20 select-none"
      style={{ left: inset, top: "50%", transform: "translateY(-50%)", width: size, height }}
    >
      {Array.from({ length: cap }, (_, i) => {
        const filled = i < earned;
        const isNext = i === earned && earned < cap;
        return (
          <div
            key={i}
            className="absolute left-0"
            style={{
              width: size,
              height: size,
              // i = 0 at the BOTTOM: the stack grows upward.
              bottom: i * step,
              // Later balls overlap the ones below them, so the pile has a
              // front-to-back order instead of looking interleaved.
              zIndex: i,
              // The empty slots have to stay READABLE: they are what shows
              // the cap, and with the "+N" gone this stack is the only place
              // interest appears at all. At 0.18 they vanished into the board.
              opacity: filled ? 1 : isNext ? 0.72 : 0.34,
              transition: "opacity 300ms ease",
            }}
          >
            <span data-ball={filled ? "filled" : isNext ? "next" : "empty"}>
              <Ball size={size} filled={filled} progress={isNext ? toNext : 0} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A Poké Ball drawn as SVG rather than an <img>.
 *
 * It has to sit at mon size, which is 35px on a phone and 94px on a desktop —
 * a bitmap would be soft at one end or wasteful at the other, and there is no
 * ball in the sprite mirror to use anyway. Everything scales from the viewBox.
 */
function Ball({ size, filled, progress }: { size: number; filled: boolean; progress: number }) {
  const R = 46;
  const C = 2 * Math.PI * R;
  // SVG ids live in ONE global namespace per document, so five stacked balls
  // would emit five identical clipPath ids and every one of them would resolve
  // to whichever rendered first. It happens to look right here because the
  // clips are identical -- which is luck, not correctness, and it breaks the
  // moment the halves differ between states.
  const uid = useId().replace(/:/g, "");
  const topId = `ball-top-${uid}`;
  const botId = `ball-bottom-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <clipPath id={topId}><rect x="0" y="0" width="100" height="50" /></clipPath>
        <clipPath id={botId}><rect x="0" y="50" width="100" height="50" /></clipPath>
      </defs>

      {/* Shell. An unearned slot keeps the silhouette but drops the colour, so
          the empty part of the stack reads as "not yet" rather than as a
          different object. */}
      <circle cx="50" cy="50" r={R} fill={filled ? "#ef4444" : "#1e293b"} clipPath={`url(#${topId})`} />
      <circle cx="50" cy="50" r={R} fill={filled ? "#f8fafc" : "#0f172a"} clipPath={`url(#${botId})`} />
      <circle cx="50" cy="50" r={R} fill="none" stroke="#0b1020" strokeWidth="5" />
      {/* Unearned slots get a light rim on top of the dark outline, so an empty
          stack reads as five waiting slots instead of five dark smudges. */}
      {!filled && (
        <circle cx="50" cy="50" r={R} fill="none" stroke="#94a3b8" strokeWidth="2" opacity="0.55" />
      )}
      <rect x="4" y="45" width="92" height="10" fill="#0b1020" />
      <circle cx="50" cy="50" r="13" fill="#0b1020" />
      <circle cx="50" cy="50" r="8.5" fill={filled ? "#f8fafc" : "#1e293b"} />

      {/* Progress toward this ball, as a ring around it — the gold you have
          banked since the last breakpoint, which the old "+N" could not show
          at all. */}
      {progress > 0 && (
        <circle
          cx="50" cy="50" r={R}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${C * progress} ${C}`}
          transform="rotate(-90 50 50)"
          opacity="0.95"
        />
      )}

      {/* A soft highlight, so a flat fill at 90px does not read as a sticker. */}
      {filled && (
        <ellipse cx="34" cy="30" rx="13" ry="9" fill="#ffffff" opacity="0.28" clipPath={`url(#${topId})`} />
      )}
    </svg>
  );
}
