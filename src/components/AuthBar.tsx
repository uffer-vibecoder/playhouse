"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { mergeLocalIntoCloud } from "@/lib/progress";

/**
 * Sign-in is entirely optional and says so.
 *
 * Playing needs no account, so this never blocks anything — it offers to keep
 * progress across devices and otherwise stays out of the way.
 *
 * Two routes in, and which appear depends on what the project actually has
 * enabled, read at runtime rather than hardcoded:
 *
 *   OAuth       no email involved, so there is no rate limit to hit. Listed
 *               first for that reason.
 *   Magic link  Supabase's built-in mailer allows only a handful of messages an
 *               hour and is meant for testing. Tolerable in practice — signing
 *               in is a once-per-device event and sessions persist — but it
 *               will bite during setup, so that failure is named plainly rather
 *               than shown as a raw error.
 */

type Providers = { google: boolean; github: boolean };

/**
 * The display name lives in Supabase's user_metadata: no table, no migration,
 * and a player can change it themselves, which is exactly the trust level a
 * name needs.
 *
 * The limit worth knowing: user_metadata is readable only by its owner. It is
 * enough for "show me my own name", and it will not be enough once head-to-head
 * lands and a linked partner has to see it — that wants a row in a table with
 * its own policy. One string is cheap to move when the time comes.
 */
const nameOf = (user: { email?: string; user_metadata?: Record<string, unknown> } | null) => {
  const raw = user?.user_metadata?.display_name;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
};

export default function AuthBar({ gameId = "codeword" }: { gameId?: string }) {
  const [email, setEmail] = useState("");
  const [who, setWho] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers>({ google: false, github: false });

  const sb = getSupabase();

  useEffect(() => {
    if (!sb) return;
    let alive = true;

    sb.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setWho(data.user?.email ?? null);
      const n = nameOf(data.user ?? null);
      setName(n);
      setNameDraft(n ?? "");
    });

    // ask the project what it supports, so a provider switched on in the
    // dashboard shows up here without a code change
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setProviders({ google: !!d?.external?.google, github: !!d?.external?.github });
      })
      .catch(() => {});

    const { data: sub } = sb.auth.onAuthStateChange(async (event, session) => {
      if (!alive) return;
      setWho(session?.user?.email ?? null);
      const n = nameOf(session?.user ?? null);
      setName(n);
      setNameDraft(n ?? "");
      if (event === "SIGNED_IN") {
        const moved = await mergeLocalIntoCloud(gameId);
        setStatus(
          moved ? `Signed in. ${moved} saved puzzle${moved === 1 ? "" : "s"} synced.` : "Signed in."
        );
        setOpen(false);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [sb, gameId]);

  const oauth = useCallback(
    async (provider: "google" | "github") => {
      if (!sb) return;
      await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    },
    [sb]
  );

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

      if (!error) {
        setStatus("Check your email for a link. It signs you in — no password.");
      } else if (/rate limit/i.test(error.message)) {
        setStatus(
          "Too many sign-in emails for now — the built-in mailer only allows a few an hour. " +
            "Wait a while and try once, or use another option above."
        );
      } else {
        setStatus(`That didn't send: ${error.message}`);
      }
    },
    [sb, email]
  );

  const signOut = useCallback(async () => {
    if (!sb) return;
    await sb.auth.signOut();
    setOpen(false);
    setStatus("Signed out. Progress stays on this device.");
  }, [sb]);

  const saveName = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!sb) return;
      const wanted = nameDraft.trim().slice(0, 40);
      setBusy(true);
      const { error } = await sb.auth.updateUser({ data: { display_name: wanted } });
      setBusy(false);
      if (error) {
        // never swallow this: the field would just look like it had worked
        setStatus(`That didn't save: ${error.message}`);
        return;
      }
      setName(wanted || null);
      setStatus(wanted ? `You'll show up as ${wanted}.` : "Name cleared.");
    },
    [sb, nameDraft]
  );

  if (!supabaseConfigured) return null;

  return (
    <>
      {who ? (
        <button className="linkish" onClick={() => setOpen((v) => !v)} title={who}>
          {name ?? "Your account"}
        </button>
      ) : (
        <button className="linkish" onClick={() => setOpen((v) => !v)}>
          Sign in to save
        </button>
      )}

      {open && who && (
        <div className="dialog">
          <h3>Your account</h3>
          <p>
            Signed in as {who}. Choose the name you want to show up as — it is only used to
            label your own results for now.
          </p>
          <form className="row" onSubmit={saveName}>
            <input
              type="text"
              maxLength={40}
              placeholder="Your name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              aria-label="Display name"
            />
            <button className="tool" style={{ flex: "0 0 auto" }} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="tool" onClick={signOut} type="button">
              Sign out
            </button>
          </div>
          {status && <p className="note-sm">{status}</p>}
        </div>
      )}

      {open && !who && (
        <div className="dialog">
          <h3>Keep your progress</h3>
          <p>
            You do not need an account to play. Sign in and your half-finished puzzles follow
            you to any other device — including the ones you have already started here.
          </p>

          {(providers.google || providers.github) && (
            <div className="row" style={{ marginBottom: 12 }}>
              {providers.google && (
                <button className="tool" onClick={() => oauth("google")}>
                  Continue with Google
                </button>
              )}
              {providers.github && (
                <button className="tool" onClick={() => oauth("github")}>
                  Continue with GitHub
                </button>
              )}
            </div>
          )}

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
