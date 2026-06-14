"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches render-time crashes (e.g. a malformed RTDB payload reaching the game)
 *  so the whole app doesn't go blank with no recovery path. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[error-boundary]", error);
  }

  reset = () => {
    // Drop any saved room so reload starts clean, then reload.
    try { window.sessionStorage.removeItem("poketft_room"); } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-2xl font-extrabold text-rose-400">Something went wrong</div>
        <p className="text-sm text-slate-400 max-w-md">The game hit an unexpected error. Reloading usually fixes it — your game may still be live, just rejoin with the same code.</p>
        <button onClick={this.reset} className="px-6 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold">
          Reload
        </button>
      </div>
    );
  }
}
