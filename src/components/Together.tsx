"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { claimInvite, createInvite, loadLink, pendingInvite, unlink, type Link } from "@/lib/link";

/**
 * Linking up with one other person.
 *
 * Lives on the record because that is the page about *you* — and because it has
 * to sit behind sign-in, which is the one part of the site that does. Signed
 * out it says so plainly rather than hiding, since a section that appears from
 * nowhere after you log in is worse than one that explains itself.
 *
 * There is no list and no search. Two people, a code passed between them, and
 * a way out. Everything that would make this a social network is absent on
 * purpose.
 */
export default function Together() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [entered, setEntered] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return setSignedIn(false);
    const { data } = await sb.auth.getSession();
    const on = !!data.session?.user;
    setSignedIn(on);
    if (!on) return;
    setLink(await loadLink());
    setCode(await pendingInvite());
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    // Read once, then follow the session. Both go through the same async
    // `refresh`, so nothing sets state during the effect body itself — the
    // linter is right to object to that, and the fix is also less code.
    const run = async () => {
      if (alive) await refresh();
    };
    void run();
    const { data: sub } = sb.auth.onAuthStateChange(run);
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const invite = async () => {
    setBusy(true);
    setNote(null);
    const r = await createInvite();
    setBusy(false);
    if ("error" in r) return setNote(r.error);
    setCode(r.code);
  };

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const r = await claimInvite(entered);
    setBusy(false);
    if ("error" in r) {
      // The database gives one message for expired, claimed and never-existed
      // alike, on purpose. Passing it through unchanged keeps that true.
      return setNote(r.error);
    }
    setEntered("");
    setNote("Linked.");
    void refresh();
  };

  const drop = async () => {
    setBusy(true);
    const r = await unlink();
    setBusy(false);
    setNote("error" in r ? r.error : "Unlinked. It went both ways.");
    void refresh();
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!supabaseConfigured) return null;

  return (
    <section className="togetherblock">
      <div className="stampshead">
        <h2 className="entryname">Together</h2>
        <span className="recsub">
          One other person, by a code you pass between you. They see what you have finished —
          never what you have answered.
        </span>
      </div>

      {signedIn === false && (
        <p className="nothingyet">Sign in to link up. Everything else here works signed out.</p>
      )}

      {signedIn && link && (
        <div className="linked">
          <div>
            <b className="linkname">{link.name ?? "Your partner"}</b>
            <span className="recsub">
              {link.name ? "" : "They have not set a display name yet. "}
              Linked since {new Date(link.since).toLocaleDateString()}.
            </span>
          </div>
          <button className="tool" onClick={drop} disabled={busy}>
            Unlink
          </button>
        </div>
      )}

      {signedIn && !link && (
        <div className="linkrow">
          <div className="linkhalf">
            <h3 className="linkhead">Invite someone</h3>
            {code ? (
              <>
                <output className="invitecode">{code}</output>
                <div className="linkactions">
                  <button className="tool" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button className="tool" onClick={invite} disabled={busy}>
                    New code
                  </button>
                </div>
                <p className="recsub">Good for seven days, and only once.</p>
              </>
            ) : (
              <>
                <button className="tool" onClick={invite} disabled={busy}>
                  {busy ? "…" : "Make a code"}
                </button>
                <p className="recsub">Pass it on however you like. It is not sent anywhere.</p>
              </>
            )}
          </div>

          <form className="linkhalf" onSubmit={claim}>
            <h3 className="linkhead">Or enter theirs</h3>
            <input
              className="codefield"
              value={entered}
              onChange={(e) => setEntered(e.target.value)}
              placeholder="XXXXX-XXXXX"
              autoComplete="off"
              spellCheck={false}
              aria-label="Invite code"
            />
            <button className="tool" type="submit" disabled={busy || !entered.trim()}>
              Link up
            </button>
          </form>
        </div>
      )}

      {note && <p className="linknote">{note}</p>}
    </section>
  );
}
