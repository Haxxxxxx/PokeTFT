"use client";

import { useDraggable } from "@dnd-kit/core";
import { getDef, spriteUrl } from "@/game/data/mons";
import { COST_COLOR } from "@/game/ui";
import { useUi } from "@/game/store/uiStore";
import { useGame } from "@/game/store/gameStore";
import { useT } from "@/lib/i18n";
import { MEGA_STONE, canMega, isMegaActive } from "@/game/data/mega";
import { HEX_CLIP } from "@/game/engine/hex";
import { crispSize } from "@/game/ui/pixel";
import { StarIcon, MegaIcon } from "./icons";
import { ItemGlyph } from "./ItemGlyph";
import type { UnitInstance } from "@/game/types";

/** Small icons of the items a unit is holding, pinned to the token corner. */
/**
 * Held items, as a row of framed pips centred under the unit.
 *
 * They used to be bare 10px glyphs crammed into the bottom-right corner, which
 * at board scale is unreadable and easy to miss entirely — and which item a
 * carry is holding is a thing you check constantly. Now they sit under the
 * unit like TFT's, in dark frames so they read against both the sprite and the
 * stone, and they scale with the tile instead of staying fixed.
 */
function ItemPips({ items, megaReady, unitSize }: { items: string[]; megaReady: boolean; unitSize: number }) {
  const t = useT();
  if (items.length === 0) return null;
  const box = Math.max(13, Math.round(unitSize * 0.26));
  const glyph = Math.round(box * 0.72);
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-none"
      style={{ bottom: -Math.round(box * 0.3), gap: Math.max(1, Math.round(box * 0.1)) }}
    >
      {items.map((id, i) => (
        <span
          key={i}
          title={id === MEGA_STONE ? t.it_mega_stone : id}
          // A held Mega Stone and an ARMED one are different states: armed
          // means this mon can actually mega-evolve. Keeping them visually
          // apart matters, since holding one on a mon that can't use it is a
          // mistake worth seeing.
          className={`grid place-items-center rounded-[3px] border ${
            id !== MEGA_STONE
              ? "text-slate-100 border-white/25 bg-slate-950/85"
              : megaReady
                ? "text-fuchsia-100 border-fuchsia-300 bg-fuchsia-900/90 animate-pulse"
                : "text-fuchsia-200/50 border-fuchsia-400/30 bg-slate-950/85"
          }`}
          style={{ width: box, height: box, boxShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
        >
          {id === MEGA_STONE
            ? <MegaIcon size={glyph} />
            : <ItemGlyph id={id} size={glyph} />}
        </span>
      ))}
    </div>
  );
}

export function Stars({ star }: { star: number }) {
  return (
    <div className="flex justify-center gap-px -mt-1 leading-none text-amber-300 drop-shadow">
      {Array.from({ length: star }).map((_, i) => (
        <StarIcon key={i} size={9} />
      ))}
    </div>
  );
}

export function UnitChip({ unit, size = 56, interactive = true, canDeploy = true, shape = "square" }: { unit: UnitInstance; size?: number; interactive?: boolean; canDeploy?: boolean; shape?: "square" | "hex" }) {
  const t = useT();
  const def = getDef(unit.defId);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: unit.iid, disabled: !interactive });
  const setInspect = useUi((s) => s.setInspect);
  const armedItem = useUi((s) => s.armedItem);
  const armItem = useUi((s) => s.armItem);
  const equipItem = useGame((s) => s.equipItem);
  const deployUnit = useGame((s) => s.deployUnit);
  const dex = def.dex[unit.star - 1];
  const color = COST_COLOR[def.cost];

  // RTDB strips empty arrays, so a rehydrated unit can arrive without `items`.
  const heldItems = unit.items ?? [];
  const megaReady = isMegaActive(unit.defId, heldItems);
  // Any held item can be equipped (max 3); the Mega Stone also needs a Mega-capable mon.
  const canEquipArmed = interactive && !!armedItem && heldItems.length < 3 && (armedItem === MEGA_STONE ? (canMega(unit.defId) && unit.star >= 3) : true);

  function onClick() {
    if (interactive && armedItem) {
      if (canEquipArmed) {
        equipItem(unit.iid, armedItem);
        armItem(null);
      }
      return;
    }
    setInspect(unit.defId, unit.star, unit.iid);
  }

  // Double-click a bench unit to quick-deploy it onto the first free board cell.
  // `canDeploy` is separate from `interactive`: the bench stays draggable during
  // combat (so you can still sell), but the board is locked then — no deploy.
  function onDoubleClick() {
    if (interactive && canDeploy && unit.pos === null) deployUnit(unit.iid);
  }

  const ring = megaReady ? "#f0abfc" : color;
  const title = megaReady ? `${def.stageNames[unit.star - 1]} · ${t.uc_mega_ready}` : `${def.stageNames[unit.star - 1]} · ${t.uc_click_details}`;
  // Fill the token, then some. PokéAPI sprites carry a lot of transparent
  // padding, so a sprite drawn at exactly the tile size reads much smaller than
  // the tile. On the board we oversize it and let it break the hex — the same
  // reason TFT's champions overflow their cell — which is what makes a unit read
  // as a creature standing there rather than an icon sitting in a box.
  // Oversized to cancel the sprite's transparent padding (a 96x96 frame where
  // the creature occupies barely half the box), then SNAPPED to a whole
  // multiple of that 96px source. Nearest-neighbour upscaling is only clean at
  // integer multiples — at 1.72x some source pixels cover two screen pixels and
  // their neighbours cover one, which is what made the board look mushy.
  const spriteSize = shape === "hex" ? crispSize(size * 1.85) : size - 6;
  const sprite = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={spriteUrl(dex)}
      alt={def.name}
      width={spriteSize}
      height={spriteSize}
      className={`image-render-pixel pointer-events-none ${shape === "hex" ? "unit-rim" : "drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"}`}
      style={{ imageRendering: "pixelated" }}
      draggable={false}
    />
  );

  // Tiny cost number — a colorblind-safe backup for the cost-COLOUR ring (so rarity reads
  // without relying on the green/blue/purple/gold hue alone).
  const costBadge = (
    <span className="absolute -bottom-0.5 -left-0.5 z-10 text-[8px] font-extrabold leading-none px-[3px] py-px rounded pointer-events-none"
      style={{ background: color, color: "#0b1020", boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }}>{def.cost}</span>
  );

  // Hex token (on the board) — the colored token follows the hexagonal cell.
  if (shape === "hex") {
    return (
      <div
        ref={interactive ? setNodeRef : undefined}
        {...(interactive ? listeners : {})}
        {...(interactive ? attributes : {})}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        data-inspectable
        style={{ width: size, height: size, opacity: isDragging ? 0.4 : 1 }}
        className={`relative select-none touch-none ${interactive ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${canEquipArmed ? "animate-pulse" : ""}`}
        title={title}
      >
        {/* A thin cost-coloured ring on the GROUND, behind the unit — not a
            plate behind it. The old opaque hex fill made every unit read as an
            icon in a box; in TFT the champion stands directly on the stone and
            only its base ring touches the board. That fill also carried the hex
            clip-path, which silently cropped the oversized sprite back to tile
            size and cancelled the overflow entirely. */}
        <span
          className="absolute inset-0 unit-base pointer-events-none"
          style={{ clipPath: HEX_CLIP, boxShadow: `inset 0 0 0 1.5px ${ring}aa, inset 0 0 10px ${ring}22` }}
        />
        {/* Sprite is oversized and bottom-anchored so it breaks the hex upward,
            the way a standing figure would. Nothing here clips it. */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center" style={{ overflow: "visible" }}>
          {sprite}
        </div>
        {/* Stars ride just above the sprite's crown. Derived from how far the
            oversized sprite actually overflows the cell, so they track the
            scale instead of drifting when it changes. */}
        <div className="absolute inset-x-0 flex justify-center pointer-events-none" style={{ top: -(spriteSize - size) * 0.5 - 6 }}>
          <Stars star={unit.star} />
        </div>
        {costBadge}
        <ItemPips items={heldItems} megaReady={megaReady} unitSize={size} />
      </div>
    );
  }

  return (
    <div
      ref={interactive ? setNodeRef : undefined}
      {...(interactive ? listeners : {})}
      {...(interactive ? attributes : {})}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-inspectable
      style={{
        width: size, height: size,
        borderColor: ring,
        boxShadow: megaReady ? "0 0 8px #f0abfcaa" : `0 0 6px ${color}66`,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`relative rounded-md border-2 bg-slate-900/80 select-none touch-none flex items-center justify-center
        ${interactive ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
        ${canEquipArmed ? "ring-2 ring-fuchsia-400 animate-pulse" : ""}`}
      title={title}
    >
      {sprite}
      <div className="absolute top-0 left-0 right-0">
        <Stars star={unit.star} />
      </div>
      {costBadge}
      <ItemPips items={heldItems} megaReady={megaReady} unitSize={size} />
    </div>
  );
}
