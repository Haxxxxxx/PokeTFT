"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { useRoom } from "@/game/net/roomStore";
import { useAppStore } from "@/game/store/appStore";

/** Friends list with quick-add by username + join-friend's-game. */
export function FriendsPanel() {
  // Field-level selectors so auth churn (busy/error/status during sign-in) doesn't
  // re-render the whole friends list on every store write.
  const user = useAuth((s) => s.user);
  const profile = useAuth((s) => s.profile);
  const friends = useAuth((s) => s.friends);
  const addFriendByName = useAuth((s) => s.addFriendByName);
  const unfriend = useAuth((s) => s.unfriend);
  const join = useRoom((s) => s.join);
  const myCode = useRoom((s) => s.code);
  const openUserProfile = useAppStore((s) => s.openUserProfile);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  // Track the message-clear timer so we never setState on an unmounted panel.
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (msgTimer.current) clearTimeout(msgTimer.current); }, []);

  const isGuest = user?.isAnonymous;

  const add = async () => {
    if (!name.trim()) return;
    try {
      const res = await addFriendByName(name);
      setMsg(res.ok ? `Added ${name.trim()}` : res.error ?? "Failed");
      if (res.ok) setName("");
    } catch {
      // A network/permission failure must surface as a message, not an unhandled
      // rejection that could leave the panel in a broken state.
      setMsg("Network error — try again");
    }
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 2500);
  };

  return (
    <div className="panel w-full flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Friends</h2>
        {profile?.username && <span className="text-[11px] text-slate-500">you: <span className="text-amber-300 font-semibold">{profile.username}</span></span>}
      </div>

      {isGuest ? (
        <p className="text-xs text-slate-500">Create an account to add friends and quick-join their games.</p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Add by username"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
            />
            <button onClick={add} className="px-3 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-xs font-bold text-white">Add</button>
          </div>
          {msg && <p className="text-[11px] text-slate-400">{msg}</p>}

          <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
            {friends.length === 0 && <p className="text-xs text-slate-600">No friends yet — add someone by their username.</p>}
            {friends.map((f) => (
              <div key={f.uid} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-slate-800/50 group">
                <button onClick={() => openUserProfile(f.uid)} title="View profile" className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                  <span className="relative w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                    {f.photoURL
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={f.photoURL} alt="" width={26} height={26} style={{ imageRendering: "pixelated" }} />
                      : <span className="text-[11px] font-bold text-slate-500">{(f.username || "?").slice(0, 1).toUpperCase()}</span>}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${f.online ? "bg-emerald-400" : "bg-slate-600"}`} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-200 truncate group-hover:text-amber-200">{f.username || "—"}</span>
                    <span className="text-[10px] text-slate-500">{f.currentGame ? `in game ${f.currentGame}` : f.online ? "online" : "offline"}</span>
                  </span>
                </button>
                {f.currentGame && f.currentGame !== myCode && (
                  <button onClick={() => join(f.currentGame!, profile?.username ?? "Player")} className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white">Join</button>
                )}
                <button onClick={() => unfriend(f.uid)} title="Remove" className="text-slate-600 hover:text-rose-400 text-sm opacity-0 group-hover:opacity-100">×</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
