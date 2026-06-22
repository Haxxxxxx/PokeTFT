#!/usr/bin/env bash
# Mirror the PokéAPI sprites + cries the game references into public/ (served same-origin by
# Firebase Hosting). Idempotent — skips files already present. Re-run after adding/removing mons.
set -euo pipefail
cd "$(dirname "$0")/.."
SPRITE_BASE="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"
CRY_BASE="https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest"
mkdir -p public/sprites public/cries

# Sprites: every unit dex + every mega form's megaDex.
npx tsx -e '
import { UNITS } from "./src/game/data/mons";
import { MEGA_FORMS } from "./src/game/data/mega";
const s = new Set<number>();
for (const u of UNITS) for (const d of u.dex) if (typeof d === "number") s.add(d);
for (const m of Object.values(MEGA_FORMS)) s.add(m.megaDex);
console.log([...s].sort((a,b)=>a-b).join("\n"));
' | xargs -P 12 -I {} bash -c '[ -s "public/sprites/{}.png" ] || curl -fsS --retry 3 --retry-delay 1 -o "public/sprites/{}.png" "'"$SPRITE_BASE"'/{}.png" || echo "MISS sprite {}"'
echo "mirrored sprites: $(ls public/sprites/*.png 2>/dev/null | wc -l)"

# Cries: national-dex forms only (no mega — playCry is only called with def.dex[*]). A missing
# cry is harmless (silence), so drop the empty file on a 404.
npx tsx -e '
import { UNITS } from "./src/game/data/mons";
const s = new Set<number>();
for (const u of UNITS) for (const d of u.dex) if (typeof d === "number" && d < 10000) s.add(d);
console.log([...s].sort((a,b)=>a-b).join("\n"));
' | xargs -P 12 -I {} bash -c '[ -s "public/cries/{}.ogg" ] || curl -fsS --retry 3 --retry-delay 1 -o "public/cries/{}.ogg" "'"$CRY_BASE"'/{}.ogg" || { rm -f "public/cries/{}.ogg"; echo "MISS cry {}"; }'
echo "mirrored cries: $(ls public/cries/*.ogg 2>/dev/null | wc -l)"
