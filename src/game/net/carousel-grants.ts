/**
 * Carousel rewards for players who never picked.
 *
 * A carousel is a free reward every player is owed. The pick is applied
 * entirely in the picker's own client (netCarouselPick writes to the local
 * game store), and the server only records a `carouselPicked` flag — so a
 * player who is disconnected when the timer runs out simply never applies
 * anything. endCarousel wiped the node and moved on, and the round's reward
 * was gone. Closing the tab during a carousel cost you an item.
 *
 * An earlier fix covered clients that were still ALIVE and connected, by
 * blocking the early finish until everyone had picked. That helps a
 * backgrounded tab; it does nothing for a player who is genuinely gone, since
 * the deadline still bounds the wait.
 *
 * So the host leaves the reward in a mailbox the player drains when they come
 * back:
 *
 *   games/{code}/grants/{uid}/{roundKey} = { pick, key, ts }
 *
 * Shaped after the co-op transfer mailbox (coop.ts), with one deliberate
 * difference: the id is the ROUND KEY, not a push id. A push id makes every
 * write a new row, so a host retry — and endCarousel can be retried by the
 * repair path — would grant the same carousel twice. Keyed by round, a retry
 * overwrites the row it already wrote.
 *
 * The granted pick is always `carousel[uid][0]`, which startCarousel builds as
 * the ITEM slot (the remaining four are units). That is not an arbitrary
 * choice of default: netCarouselPick silently drops a unit when the bench is
 * full, so a unit grant could evaporate on arrival, while an item always
 * lands.
 */
import { ref, remove, onChildAdded, off } from "firebase/database";
import { db } from "./firebase";

export type CarouselGrant = { pick: string; key: string; ts?: number };

const boxRef = (code: string, uid: string) => ref(db(), `games/${code}/grants/${uid}`);

/**
 * Subscribe to rewards left for me. `onGrant` is called with each one; it must
 * return true if it applied it (or decided it was already applied), at which
 * point the row is cleared.
 *
 * At-least-once, like the transfer box: the caller has to tolerate a repeat.
 * The caller does that by checking the authoritative `carouselPicked` flag for
 * the same round before applying, which is why the key travels with the grant.
 */
export function subscribeCarouselGrants(
  code: string,
  myUid: string,
  onGrant: (g: CarouselGrant) => boolean,
): () => void {
  const r = boxRef(code, myUid);
  const handler = onChildAdded(r, (snap) => {
    const val = snap.val() as CarouselGrant | null;
    if (!val || typeof val.pick !== "string" || typeof val.key !== "string") {
      remove(snap.ref).catch(() => {}); // malformed → drop it
      return;
    }
    let applied = false;
    try { applied = onGrant(val); } finally {
      // Only clear once it has actually been taken. A grant dropped because the
      // client was mid-hydration must still be there on the next subscribe,
      // otherwise this fix reintroduces the bug it exists to close.
      if (applied) remove(snap.ref).catch(() => {});
    }
  });
  return () => off(r, "child_added", handler);
}
