"use client";

import { useDraggable } from "@dnd-kit/core";
import { getDef, spriteUrl } from "@/game/data/mons";
import { relativeModelScale } from "@/game/data/model-scale";
import { spriteArt } from "@/game/ui/sprite-art";
import { COST_COLOR } from "@/game/ui";
import { useUi } from "@/game/store/uiStore";
import { useGame } from "@/game/store/gameStore";
import { useT } from "@/lib/i18n";
import { MEGA_STONE, canMega, isMegaActive } from "@/game/data/mega";
import { HEX_CLIP } from "@/game/engine/hex";
import { crispSize } from "@/game/ui/pixel";
import { StarIcon, MegaIcon } from "./icons";
import { ItemGlyph } from "./ItemGlyph";
import { PokemonModelPreview } from "./PokemonModelPreview";
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
/**
 * Exported so the COMBAT renderers draw held items identically to the planning
 * board. They had no item display at all — `FrameUnit` didn't even carry the
 * ids — so which item a carry held became invisible the moment a fight started,
 * which is exactly when it matters most.
 */
export function ItemPips({ items, megaReady, unitSize }: { items: string[]; megaReady: boolean; unitSize: number }) {
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

/**
 * Star tier, drawn in the TIER's colour on a dark plate.
 *
 * It was a flat amber row at every tier, so 1★ and 3★ differed only by how
 * many tiny glyphs you counted — on a crowded board that is not a readable
 * difference. Bronze/silver/gold matches the ring colours the 3D units already
 * use, so a unit's tier reads the same way in both renderers. Silver is cooled
 * deliberately: a neutral grey reads as plain white against the plate.
 */
const STAR_TIER = {
  1: "#c8761f",
  2: "#9fb6d4",
  3: "#ffc21e",
} as const;

export function Stars({ star }: { star: number }) {
  const colour = STAR_TIER[Math.min(3, Math.max(1, star)) as 1 | 2 | 3];
  return (
    <div
      // The plate is NOT conditional on tier. Dropping it for 1-star (and
      // losing the old `drop-shadow` with it) left a bronze glyph sitting
      // directly on the sprite with nothing behind it — effectively invisible
      // on a bright mon like Pikachu or Jolteon, which the previous flat amber
      // + shadow had handled fine.
      className="flex justify-center items-center gap-px -mt-1 leading-none mx-auto rounded-full px-1 drop-shadow"
      style={{
        color: colour,
        background: "rgba(6,10,22,0.72)",
        boxShadow: star > 2 ? `0 0 7px -1px ${colour}` : undefined,
        width: "fit-content",
      }}
    >
      {Array.from({ length: star }).map((_, i) => (
        <StarIcon key={i} size={9} />
      ))}
    </div>
  );
}

/** Height of the star row, so it can be lifted clear of the mon's head. */
const STAR_BADGE_H = 13;

export function UnitChip({ unit, size = 56, interactive = true, canDeploy = true, shape = "square", showSprite = true, showModel = false, dragHitArea = false, tilt = 0 }: { unit: UnitInstance; size?: number; interactive?: boolean; canDeploy?: boolean; shape?: "square" | "hex"; showSprite?: boolean; showModel?: boolean; dragHitArea?: boolean; tilt?: number }) {
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
  // Capped at 2.1x the cell: snapping is unbounded on its own, and on the
  // smallest tiles the nearest whole multiple is several times the hex.
  //
  // Scaled by the species' real (compressed) height, the same rule the 3D
  // models use — so a Rattata no longer occupies a Charizard's footprint. The
  // 2.1x cap still bounds it: without one, a large mon covers its neighbours'
  // hexes, which is what made the board look mushy.
  const rel = relativeModelScale(dex);
  const spriteSize = shape === "hex"
    ? crispSize(Math.min(size * 1.85 * rel, size * 2.1), size * 2.1)
    : Math.round((size - 6) * rel);
  const sprite = showModel ? (
    <PokemonModelPreview
      dex={dex}
      alt={def.stageNames[unit.star - 1]}
      width={spriteSize}
      height={spriteSize}
      className={shape === "hex" ? "unit-rim" : "drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={spriteUrl(dex)}
      alt=""
      aria-hidden
      width={spriteSize}
      height={spriteSize}
      className={`image-render-pixel pointer-events-none ${shape === "hex" ? "unit-rim" : "drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"}`}
      // maxWidth:none — see the note in CombatStage. Preflight's
      // `img { max-width: 100% }` clamped this to the cell, so the sprite never
      // reached the size crispSize/relativeModelScale asked for, and the star
      // badge was positioned from a size that was never used.
      style={{ imageRendering: "pixelated", maxWidth: "none" }}
      draggable={false}
    />
  );
  // How far the grab zone may reach ABOVE its own cell.
  //
  // A hex row is tileH * ROW_STEP apart, and tileH is TILE_ASPECT * tileW, so
  // the gap between one unit's feet and the next row's is about 0.71 * tileW —
  // while `size` here is tileW - 6, i.e. essentially tileW.
  //
  // The sprite is drawn far taller than that: up to 2.1x the cell, so its
  // overhang alone reaches ~1.6 row pitches. Matching the grab zone to the
  // sprite (which is what this did) therefore laid every unit's hitbox clean
  // over the unit standing BEHIND it — and Board stacks by row
  // (`zIndex: localR + ALLY_ROW0`), so the nearer unit wins. Reaching for a
  // back-row mon picked up the one in front of it.
  //
  // Half the row pitch is the most it can take without entering the next row's
  // half of the gap. The cost is that a very tall mon is not grabbable by the
  // head; the alternative is that its neighbour is not grabbable at all.
  const GRAB_CEILING = size * 0.35;
  const dragHitbox = interactive && dragHitArea ? (
    <span
      className="absolute z-20"
      style={{
        left: 0,
        right: 0,
        top: -Math.min(Math.max(0, spriteSize - size), GRAB_CEILING),
        bottom: 0,
        pointerEvents: "auto",
      }}
      aria-hidden
    />
  ) : null;
  const costBadge = (
    <span className="absolute -bottom-0.5 -left-0.5 z-10 text-[8px] font-extrabold leading-none px-[3px] py-px rounded pointer-events-none"
      style={{ background: color, color: "#0b1020", boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }}>{def.cost}</span>
  );
  const visual = (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ transform: `rotateX(${-tilt}deg)`, transformOrigin: "bottom center" }}
    >
      {shape === "hex" ? (
        <>
          <span
            className="absolute inset-0 unit-base"
            style={{ clipPath: HEX_CLIP, boxShadow: `inset 0 0 0 1.5px ${ring}aa, inset 0 0 10px ${ring}22` }}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-center" style={{ overflow: "visible" }}>
            {showSprite && sprite}
          </div>
          {/* Pinned to the mon's HEAD, not to the top of its sprite box.
              Sprite frames are mostly transparent padding — 20.6% above the art
              on average, up to 50% — so "half the overhang above the cell" put
              the stars a different, often large distance above each mon. On a
              heavily padded sprite they detached from the unit entirely. */}
          <div
            className="absolute flex justify-center"
            style={{
              top: -(spriteSize - size) + spriteArt(dex, spriteSize).top - STAR_BADGE_H,
              // Centred on the ART, not the frame — sprites that sit off-centre
              // in their box would otherwise carry their stars off to one side.
              left: size / 2 + spriteArt(dex, spriteSize).centerOffsetX,
              transform: "translateX(-50%)",
            }}
          >
            <Stars star={unit.star} />
          </div>
          {costBadge}
          <ItemPips items={heldItems} megaReady={megaReady} unitSize={size} />
        </>
      ) : (
        <>
          {showSprite && sprite}
          <div className="absolute top-0 left-0 right-0">
            <Stars star={unit.star} />
          </div>
          {costBadge}
          <ItemPips items={heldItems} megaReady={megaReady} unitSize={size} />
        </>
      )}
    </div>
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
        {dragHitbox}
        {visual}
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
      {dragHitbox}
      {visual}
    </div>
  );
}
