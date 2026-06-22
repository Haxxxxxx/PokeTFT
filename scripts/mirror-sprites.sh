#!/usr/bin/env bash
# Mirror the PokéAPI sprites the game references into public/sprites/ (served same-origin by
# Firebase Hosting). Idempotent — skips files already present. Re-run after adding/removing mons.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"
mkdir -p public/sprites
npx tsx -e '
import { UNITS } from "./src/game/data/mons";
import { MEGA_FORMS } from "./src/game/data/mega";
const s = new Set<number>();
for (const u of UNITS) for (const d of u.dex) if (typeof d === "number") s.add(d);
for (const m of Object.values(MEGA_FORMS)) s.add(m.megaDex);
console.log([...s].sort((a,b)=>a-b).join("\n"));
' | xargs -P 12 -I {} bash -c '[ -s "public/sprites/{}.png" ] || curl -fsS --retry 3 --retry-delay 1 -o "public/sprites/{}.png" "'"$BASE"'/{}.png" || echo "MISS {}"'
echo "mirrored sprites: $(ls public/sprites/*.png 2>/dev/null | wc -l)"
