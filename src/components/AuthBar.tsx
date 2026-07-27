"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { mergeLocalIntoCloud } from "@/lib/progress";

/**
 * Sign-in is entirely optional and says so.
 *
 * Playing needs no account, so this never blocks anything — it offers to keep
 * progress across devices and otherwise stays out of the way. A magic link
 * rather than a password: fewer things for a player to lose, and nothing for us
 * to store or leak.
 */
export default function AuthBar({ gameId = "codeword" }: { gameId?: string }) {
  const [email, setEmail] = useState("");
  const [who, setWho] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sb = getSupabase();

  useEffect(() => {
    if (!sb) return;
    let alive = true;

    sb.auth.getUser().then(({ data }) => {
      if (alive) setWho(data.user?.email ?? null);
    });

    const { data: sub } = sb.auth.onAuthStateChange(async (event, session) => {
      if (!alive) return;
      setWho(session?.user?.email ?? null);
      if (event === "SIGNED_IN") {
        // carry up anything solved before signing in
        const moved = await mergeLocalIntoCloud(gameId);
        setStatus(moved ? `Signed in. ${moved} saved puzzle${moved === 1 ? "" : "s"} synced.` : "Signed in.");
        setOpen(false);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [sb, gameId]);

  const sendLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!sb || !email.trim()) return;
      setBusy(true);
      setStatus(null);
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setBusy(false);
      setStatus(
        error
          ? `That didn't send: ${error.message}`
          : "Check your email for a link. It signs you in — no password."
      );
    },
    [sb, email]
  );

  const signOut = useCallback(async () => {
    if (!sb) return;
    await sb.auth.signOut();
    setStatus("Signed out. Progress stays on this device.");
  }, [sb]);

  // No backend configured: say nothing rather than offer a button that cannot work.
  if (!supabaseConfigured) return null;

  return (
    <>
      {who ? (
        <button className="linkish" onClick={signOut} title={who}>
          Sign out
        </button>
      ) : (
        <button className="linkish" onClick={() => setOpen((v) => !v)}>
          Sign in to save
        </button>
      )}

      {open && !who && (
        <div className="dialog" style={{ gridColumn: "1 / -1", width: "100%" }}>
          <h3>Keep your progress</h3>
          <p>
            You do not need an account to play. Sign in and your half-finished puzzles follow
            you to any other device — including the ones you have already started here.
          </p>
          <form className="row" onSubmit={sendLink}>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
            />
            <button className="tool" style={{ flex: "0 0 auto" }} disabled={busy}>
              {busy ? "Sending…" : "Email me a link"}
            </button>
          </form>
          {status && <p className="note-sm">{status}</p>}
        </div>
      )}

      {status && !open && <p className="note-sm">{status}</p>}
    </>
  );
}
