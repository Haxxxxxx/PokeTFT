# Flagship roster — three directions

> The one decision that unblocks everything. Every **ART** row in
> `TFT-PARITY.md` is waiting on this, and so is the 3D renderer: you can't
> source ~100 models for a roster that doesn't have an identity yet.

## What the decision actually has to satisfy

Constraints taken from the existing code and from `PACK-STRATEGY.md`:

| Constraint | Why |
|---|---|
| **~100 units, 3 stages each** | `POOL_SIZE` is 30/25/18/10/9 copies per cost tier — below ~60 units, contested comps stop being interesting. 3 stages = star-ups. So ~100 designs, ~300 assets. |
| **Maps onto 12 affinities** | Already built and tested — see `src/game/packs/affinities.ts`. |
| **Strong silhouettes** | Players read the board at a glance, at ~100px, in perspective. Detail is wasted; outline is everything. |
| **Sourceable or commissionable** | A theme that only works with bespoke art is a theme that never ships. |
| **100% original** | The entire point. No fan IP — see the IP section of `PACK-STRATEGY.md`. |

---

## Direction A — Mythic Bestiary

**Pitch:** creatures from world folklore, reimagined. Not Greek-gods-again: a
wide net across yōkai, slavic folklore, west african myth, nordic sagas,
mesoamerican legend.

**Star-up reads as:** a spirit growing in power — wisp → guardian → titan.

| | |
|---|---|
| Affinity fit | **Excellent.** Folklore creatures already cluster elementally. |
| Silhouette variety | **Excellent.** Wildly different body plans. |
| Art sourcing | **Good.** Large CC0 pools (Quaternius, KayKit) of fantasy creatures; commissions are cheap because artists know the register. |
| Originality risk | **Low** — folklore itself is public domain; only specific modern depictions are owned. |
| Social hook | **Strong.** "Which myth is your main" writes its own posts. |
| Risk | Crowded space. Needs a distinct art direction to not read as generic fantasy. |

---

## Direction B — Deep Signal

**Pitch:** original synthetic lifeforms — energy-constructs, drones, drifting
organisms. A clean sci-fi register where "elemental" affinities are **signal
types** rather than classical elements.

**Star-up reads as:** a construct assembling — fragment → frame → core.

| | |
|---|---|
| Affinity fit | **Good** with renames (Tide→Flux, Ember→Thermal, Mind→Logic…). The structure is rename-safe by design. |
| Silhouette variety | **Moderate.** Risk of everything becoming "a glowing polyhedron". Needs discipline. |
| Art sourcing | **Excellent.** Geometric/low-poly is the cheapest thing to generate, commission, *or* build procedurally — you could ship without an artist. |
| Originality risk | **Lowest of the three.** Nothing to accidentally resemble. |
| Social hook | Moderate. Less instantly legible than creatures. |
| Risk | Can read cold. Hardest to make players *fond* of a unit. |

---

## Direction C — Tidebound

**Pitch:** an original ecology from one invented world — a drowned archipelago.
Reef-things, storm-birds, deep-dwellers, coral constructs. One coherent place
rather than a grab-bag.

**Star-up reads as:** a creature maturing through its life-cycle.

| | |
|---|---|
| Affinity fit | **Excellent** — a single ecology justifies why 12 affinities coexist. |
| Silhouette variety | **Good**, with deliberate design. |
| Art sourcing | **Hardest.** Bespoke creatures mean commissioning nearly everything; CC0 won't cover an invented ecology. |
| Originality risk | **Lowest conceptually** — it's wholly invented. |
| Social hook | **Strongest long-term.** A world supports lore, seasons, patch narratives. |
| Risk | Most expensive and slowest. Highest ceiling, highest cost. |

---

## Recommendation

**A (Mythic Bestiary) to launch, C (Tidebound) as the long game.**

Reasoning:

- **A is the only one that can start this month.** CC0 fantasy creature packs
  exist in volume right now, so the 3D renderer can be fed immediately and we
  learn whether players like the game before paying for art.
- **B is the safe-but-cold option.** Pick it only if you want to ship with zero
  art budget and accept a colder identity.
- **C is what A can become.** A bestiary can be narrowed into a world later; a
  world cannot be widened into a bestiary.

## If you pick A, the next steps are mechanical

1. Rename the 12 affinities to the bestiary register (structure unchanged — the
   chart is rename-safe and tested).
2. Draft ~100 creature concepts across 5 cost tiers, 3 stages each.
3. Define 8–12 traits (synergies) on top of the affinities.
4. Source a first 12 CC0 models and put them into `/lab/arena3d` for a real
   look-test before committing to the full set.

Steps 1–3 are design work I can draft for review. Step 4 is already proven to
work — see the spike.
