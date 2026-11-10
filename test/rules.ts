/**
 * RTDB security-rules tests, run against the Firebase emulator.
 *
 * These exist because the rules were the least-checked part of the project:
 * tsc, eslint, the engine suites and the production build all pass while the
 * rules allow a signed-in stranger to rewrite the leaderboard. Nothing in CI
 * could ever have caught that, because nothing executed the rules.
 *
 * Auth: the emulator does NOT verify token signatures, so an unsigned JWT with
 * the right payload is a valid identity. That keeps this suite dependency-free
 * (no @firebase/rules-unit-testing, which currently conflicts with the pinned
 * firebase major) and makes it plain REST + fetch.
 *
 *   npm run test:rules     (needs JDK 21+ and the firebase CLI)
 */

const HOST = process.env.RTDB_EMULATOR ?? "127.0.0.1:9000";
const NS = process.env.RTDB_NS ?? "demo-poketft-default-rtdb";
const BASE = `http://${HOST}`;

const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** An unsigned JWT the emulator accepts as `auth` in rules. */
function token(uid: string): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: "none", typ: "JWT" }),
    b64({
      iss: `https://securetoken.google.com/${NS}`,
      aud: NS,
      sub: uid,
      user_id: uid,
      iat: now,
      exp: now + 3600,
      auth_time: now,
      firebase: { sign_in_provider: "anonymous", identities: {} },
    }),
    "",
  ].join(".");
}

type Who = string | null; // uid, or null for the emulator OWNER (rules bypassed)

function url(path: string, who: Who) {
  const auth = who ? `&auth=${token(who)}` : "";
  return `${BASE}/${path}.json?ns=${NS}${auth}`;
}

/** Write as `who`; returns true if the rules ALLOWED it. */
async function canWrite(path: string, who: Who, value: unknown): Promise<boolean> {
  const res = await fetch(url(path, who), { method: "PUT", body: JSON.stringify(value) });
  return res.ok;
}
async function canPatch(path: string, who: Who, value: unknown): Promise<boolean> {
  const res = await fetch(url(path, who), { method: "PATCH", body: JSON.stringify(value) });
  return res.ok;
}
async function canRead(path: string, who: Who): Promise<boolean> {
  const res = await fetch(url(path, who), { method: "GET" });
  return res.ok;
}
/**
 * Seed/wipe state with ADMIN rights, bypassing rules.
 *
 * `Authorization: Bearer owner` is the emulator's admin credential. Note that a
 * request with NO auth at all is treated as ANONYMOUS here (rules apply), not
 * as owner — so seeding must be explicit about wanting admin.
 */
const ADMIN = { Authorization: "Bearer owner" };
async function seed(path: string, value: unknown): Promise<void> {
  const res = await fetch(`${BASE}/${path}.json?ns=${NS}`, {
    method: "PUT", headers: ADMIN, body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status} ${await res.text()}`);
}
async function wipe(): Promise<void> {
  await fetch(`${BASE}/.json?ns=${NS}`, { method: "DELETE", headers: ADMIN });
}

/**
 * Push database.rules.json into the emulator before testing.
 *
 * Without this the suite silently tests whatever ruleset the emulator happened
 * to boot with — it does NOT hot-reload the file — so an edited rule would look
 * unchanged and a broken rule could look fine. Loading them here makes the
 * suite test the file as it exists in the repo, right now.
 */
async function loadRules(): Promise<void> {
  const fs = await import("node:fs/promises");
  const rules = await fs.readFile(new URL("../database.rules.json", import.meta.url), "utf8");
  const res = await fetch(`${BASE}/.settings/rules.json?ns=${NS}`, {
    method: "PUT", headers: ADMIN, body: rules,
  });
  if (!res.ok) throw new Error(`loading rules failed: ${res.status} ${await res.text()}`);
  console.log("  (loaded database.rules.json into the emulator)");
}

let pass = 0, fail = 0;
function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} — expected ${expected ? "ALLOW" : "DENY"}, got ${actual ? "ALLOW" : "DENY"}`); }
}

const ATTACKER = "attacker-uid";
const VICTIM = "victim-uid";
const HOSTUID = "host-uid";
const CODE = "ABC123";

/** A room mid-match, hosted by HOSTUID, with VICTIM and ATTACKER as players. */
async function seedRoom(hostBeatAgeMs = 0) {
  await seed(`games/${CODE}`, {
    meta: {
      hostUid: HOSTUID,
      phase: "planning",
      stage: 2,
      round: 3,
      serverDriven: true,
      hostBeat: Date.now() - hostBeatAgeMs,
      deadline: Date.now() + 30000,
    },
    players: {
      [HOSTUID]: { uid: HOSTUID, name: "Host", hp: 100, alive: true, place: null, connected: true, level: 3, gold: 10 },
      [VICTIM]: { uid: VICTIM, name: "Victim", hp: 40, alive: true, place: null, connected: true, level: 3, gold: 10 },
      [ATTACKER]: { uid: ATTACKER, name: "Attacker", hp: 10, alive: true, place: null, connected: true, level: 3, gold: 10 },
    },
  });
}

async function main() {
  await loadRules();
  await wipe();

  console.log("\nA CLIENT-HOSTED game must still be able to finish a round:");
  {
    // Most matches are driven by the host's own browser, not a Cloud Function
    // (the client takes over ~4s past a missed server deadline). So every write
    // the host makes on a player's behalf has to be legal for a signed-in
    // client, not only for the Admin SDK.
    await seed(`games/${CODE}/meta`, { hostUid: HOSTUID, phase: "combat", stage: 4, round: 7 });
    await seed(`games/${CODE}/players/${HOSTUID}`, { uid: HOSTUID, name: "Host", alive: true });
    await seed(`games/${CODE}/players/${VICTIM}`, { uid: VICTIM, name: "Victim", alive: true });
    await seed(`users/${VICTIM}`, { username: "Victim", rating: 1000 });

    // The shape endCombat writes at games/<code>.
    check("the host can commit an end-of-combat round update",
      await canPatch(`games/${CODE}`, HOSTUID, {
        "meta/phase": "planning",
        "meta/round": 8,
        "meta/stage": 4,
        "meta/updatedAt": 1,
        "meta/deadline": 2,
        "meta/hostBeat": 3,
        combat: { x: 1 },
        [`players/${VICTIM}/hp`]: 0,
        [`players/${VICTIM}/alive`]: false,
        [`players/${VICTIM}/place`]: 5,
        [`players/${VICTIM}/streak`]: 0,
        [`players/${VICTIM}/botMem`]: { seen: 1 },
      }), true);

    // The shape applyRatingFor writes, as ONE root-level multi-path update.
    // leaderboard/<uid> is server-only (correctly — it was forgeable), and a
    // multi-path update is atomic, so bundling it with the two paths the host
    // IS allowed to write takes all three down together.
    check("a host CANNOT write the leaderboard (it is server-only, by design)",
      await canWrite(`leaderboard/${VICTIM}`, HOSTUID, { username: "Victim", rating: 1000, photoURL: null }), false);

    check("...so the bundled rating persist is refused entirely",
      await canPatch("", HOSTUID, {
        [`leaderboard/${VICTIM}`]: { username: "Victim", rating: 1000, photoURL: null },
        [`users/${VICTIM}/history/${CODE}`]: { place: 5, delta: -8 },
        [`games/${CODE}/results/${VICTIM}`]: { place: 5, delta: -8 },
      }), false);

    // ...while the two paths on their own are perfectly legal for the host.
    // That is the whole fix: split the write so a server-only row cannot take
    // the player's own results and history down with it.
    check("the host CAN write the eliminated player's match history",
      await canWrite(`users/${VICTIM}/history/${CODE}`, HOSTUID, { place: 5, delta: -8 }), true);
    check("the host CAN write the game's results row",
      await canWrite(`games/${CODE}/results/${VICTIM}`, HOSTUID, { place: 5, delta: -8 }), true);
    check("so history + results together survive without the leaderboard",
      await canPatch("", HOSTUID, {
        [`users/${VICTIM}/history/${CODE}`]: { place: 5, delta: -8 },
        [`games/${CODE}/results/${VICTIM}`]: { place: 5, delta: -8 },
      }), true);
  }

  console.log("\nGuest onboarding — the seeded profile must be writable:");
  {
    // The app seeds an anonymous user's profile with `Guest-${uid.slice(0,4)}`
    // and writes it as ONE multi-path update. Every field in that update has to
    // pass, so a single failing .validate silently loses the whole profile:
    // no username, no presence, no friends, no history. Observed in a real dev
    // session as `update at /users/<uid> failed: permission_denied`.
    const GUEST = "guest-uid";
    check("a guest can write the profile the app actually seeds",
      await canPatch(`users/${GUEST}`, GUEST, {
        username: `Guest-${GUEST.slice(0, 4)}`,
        usernameLower: `guest-${GUEST.slice(0, 4)}`,
        photoURL: null,
        currentGame: null,
      }), true);
    // The charset is still enforced — this is not a hole, just room for the
    // one separator the app's own generated names use.
    check("a username with a space is still rejected",
      await canWrite(`users/${GUEST}/username`, GUEST, "not ok"), false);
    check("a username with a dollar sign is still rejected",
      await canWrite(`users/${GUEST}/username`, GUEST, "ev$l"), false);
    check("a two-character username is still rejected",
      await canWrite(`users/${GUEST}/username`, GUEST, "ab"), false);
  }

  console.log("\nLeaderboard and rating (H1) — must be server-only:");
  {
    await seed(`users/${ATTACKER}`, { username: "Attacker", rating: 1000 });
    check("a player cannot set their own rating to an arbitrary value",
      await canWrite(`users/${ATTACKER}/rating`, ATTACKER, 99999), false);
    check("a player cannot forge their own leaderboard row",
      await canWrite(`leaderboard/${ATTACKER}`, ATTACKER, { username: "Attacker", rating: 99999, photoURL: null }), false);
    check("a player cannot write ANOTHER user's rating",
      await canWrite(`users/${VICTIM}/rating`, ATTACKER, 0), false);
    check("the leaderboard is still publicly readable",
      await canRead("leaderboard", ATTACKER), true);
    // NOTE: a signed-out client cannot be simulated here — the emulator's REST
    // API treats a request with no auth param as the OWNER (that is how seed()
    // works), so "no token" means admin, not anonymous. Signed-out access is
    // covered by the `auth != null` clauses, which the tokened cases exercise.
  }

  console.log("\nOwn-player node (H3) — authoritative fields must not be self-writable:");
  {
    await wipe(); await seedRoom();
    check("a player cannot set their own HP",
      await canWrite(`games/${CODE}/players/${ATTACKER}/hp`, ATTACKER, 500), false);
    check("a player cannot resurrect themselves via alive",
      await canWrite(`games/${CODE}/players/${ATTACKER}/alive`, ATTACKER, true), false);
    check("a player cannot award themselves a placement",
      await canWrite(`games/${CODE}/players/${ATTACKER}/place`, ATTACKER, 1), false);
    check("a player cannot set their own streak",
      await canWrite(`games/${CODE}/players/${ATTACKER}/streak`, ATTACKER, 20), false);
    check("a player cannot flag themselves as a bot",
      await canWrite(`games/${CODE}/players/${ATTACKER}/isBot`, ATTACKER, true), false);
    // The same fields via a PATCH on the parent node — the cascade path.
    check("a player cannot PATCH hp/alive onto their own node",
      await canPatch(`games/${CODE}/players/${ATTACKER}`, ATTACKER, { hp: 500, alive: true }), false);

    console.log("  …while legitimate self-writes still work:");
    check("a player can still sync their own board",
      await canWrite(`games/${CODE}/players/${ATTACKER}/board`, ATTACKER, [{ iid: "a", defId: "pikachu", star: 1, pos: [0, 0] }]), true);
    check("a player can still write their own gold",
      await canWrite(`games/${CODE}/players/${ATTACKER}/gold`, ATTACKER, 12), true);
    check("a player can still mark themselves connected",
      await canWrite(`games/${CODE}/players/${ATTACKER}/connected`, ATTACKER, true), true);
    check("a player can still record their carousel pick",
      await canWrite(`games/${CODE}/players/${ATTACKER}/carouselPicked`, ATTACKER, "k1"), true);
    check("a player can still concede (hp to 0)",
      await canWrite(`games/${CODE}/players/${ATTACKER}/hp`, ATTACKER, 0), true);
    check("a player can still leave (delete their own node)",
      await canWrite(`games/${CODE}/players/${ATTACKER}`, ATTACKER, null), true);
    check("the HOST can still write another player's hp",
      await canWrite(`games/${CODE}/players/${VICTIM}/hp`, HOSTUID, 30), true);
    check("the HOST can still assign a placement",
      await canWrite(`games/${CODE}/players/${VICTIM}/place`, HOSTUID, 4), true);
  }

  console.log("\nJoining a game must still work end to end:");
  {
    await wipe(); await seedRoom();
    await seed(`games/${CODE}/meta/phase`, "lobby");
    const NEWBIE = "newbie-uid";
    check("a new player can create their own full player node",
      await canWrite(`games/${CODE}/players/${NEWBIE}`, NEWBIE, {
        uid: NEWBIE, name: "Newbie", isHost: false, connected: true, ready: true,
        photoURL: null, hp: 100, level: 1, alive: true, place: null, streak: 0,
      }), true);
  }

  console.log("\nA player must not escalate by re-creating their own node:");
  {
    await wipe(); await seedRoom(); // mid-match (phase = planning)
    check("a player cannot delete and re-create their node mid-match with inflated HP",
      await canWrite(`games/${CODE}/players/${ATTACKER}`, ATTACKER, {
        uid: ATTACKER, name: "Attacker", hp: 500, alive: true, place: null, connected: true, level: 10, gold: 999,
      }), false);
  }

  console.log("\nHost takeover (H2):");
  {
    await wipe(); await seedRoom(60000); // stale heartbeat
    const OUTSIDER = "outsider-uid";
    check("a stranger who is NOT in the game cannot seize host",
      await canPatch(`games/${CODE}/meta`, OUTSIDER, { hostUid: OUTSIDER }), false);
    check("a player cannot fabricate a rating claim for another player",
      await canWrite(`games/${CODE}/rated/${VICTIM}`, ATTACKER, { place: 8, delta: -9999 }), false);
    // …but legitimate host migration must still work, or a real host crash
    // soft-locks the game. A player IN the game, with a stale heartbeat, may.
    check("a player IN the game CAN still take over a stale host",
      await canPatch(`games/${CODE}/meta`, VICTIM, { hostUid: VICTIM }), true);
  }

  console.log(`\n${pass}/${pass + fail} rules assertions passed`);
  if (fail) { console.error("\n❌ rules assertions failed"); process.exit(1); }
  console.log("✅ RTDB security rules verified against the emulator");
}

main().catch((e) => { console.error(e); process.exit(1); });
