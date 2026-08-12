/**
 * Calling a server action from the browser, when the browser is a phone.
 *
 * ## The defect this exists for
 *
 * Every client surface in this product called its action the same way:
 *
 * ```ts
 * startTransition(async () => {
 *   const result = await setThemeAction(theme);
 *   if (!result.ok) { setRefused(true); return; }
 *   router.refresh();
 * });
 * ```
 *
 * That handles a server that *answers* and says no. It does not handle a server
 * that never answers — and on an iPhone that is not an edge case, it is a lift,
 * a tunnel, a carriage between two masts, or Safari resuming a tab whose network
 * has moved on. `await` rejects, nothing catches it, React re-throws the
 * rejection during render, and with no error boundary anywhere in the
 * application the **entire tree unmounts**.
 *
 * Measured on a production build at 390px, against the real actions:
 *
 * | what was done                          | what the manager got                    |
 * |---|---|
 * | tapped a room theme, network cut       | `Application error: a client-side exception has occurred` |
 * | tapped a room theme, server 500        | the same                                |
 * | saved a character, network cut         | the same — **and every choice destroyed** |
 *
 * The last row is the expensive one. The customiser holds the manager's work in
 * `useState`; unmounting the tree throws it away, so a minute of choosing a face
 * is lost to a dropped packet, with a framework string where the room used to be
 * and no way back except retyping the URL.
 *
 * ## What this changes, and what it deliberately does not
 *
 * It converts *"we never got an answer"* into a value, so the caller stays
 * mounted and can say so. It does **not** retry, does not queue, does not cache
 * and does not persist a draft anywhere. Every mutation in this product is
 * already either naturally idempotent or guarded in the database — the box's
 * `box_openings.box_id UNIQUE`, the ledger's idempotency key, the stake's
 * `UNIQUE(stake_id, user_id)` — so **the correct retry is the manager tapping
 * again**, and a retry this module performed on its own would be a second
 * mechanism competing with guarantees that are already exactly right.
 *
 * So: no exponential backoff, no request queue, no offline mode. A private
 * ten-person application does not need one, and every one of those would be a
 * place for a duplicate to hide.
 *
 * ## Framework control flow is re-thrown, and that is load-bearing
 *
 * `requireUser()` calls `redirect('/door')`, which throws. If a session expires
 * or is revoked between loading a page and tapping a button, that throw **is**
 * the recovery path: the router catches it and the manager lands on the door
 * with their keys. Swallowing it would replace a clean sign-in prompt with
 * *"that didn't reach Tony"* on a screen that will never work again, which is a
 * worse failure than the one this module fixes.
 *
 * Rehearsal on the real build confirms Next resolves a redirect through the
 * router rather than by rejecting this promise, so the guard below is belt and
 * braces. It is kept because the cost is one comparison and the failure it
 * prevents is silent, permanent, and would be found by a manager rather than by
 * a test.
 */

/** The outcome of asking the server to do something. */
export type Attempt<T> =
  | { readonly ok: true; readonly value: T }
  /**
   * The request did not produce an answer.
   *
   * One shape for every cause — offline, DNS, a 500, a proxy, a Safari tab
   * resumed after the server restarted. The distinction is invisible to the
   * manager and there is nothing different for them to do, so the surfaces say
   * one thing and offer one gesture: try it again.
   */
  | { readonly ok: false; readonly unreachable: true };

/**
 * Next's own control-flow throws, which must never be treated as a failure.
 *
 * Matched on `digest` rather than on the error's class, because the classes are
 * internal to Next and the digest strings are what cross the client boundary.
 * A genuine server error also carries a `digest` in production — a hex hash —
 * so the prefixes are checked rather than mere presence.
 */
function isFrameworkControlFlow(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) return false;
  const digest: unknown = (cause as { digest?: unknown }).digest;
  if (typeof digest !== 'string') return false;

  return (
    digest.startsWith('NEXT_REDIRECT') ||
    digest.startsWith('NEXT_NOT_FOUND') ||
    digest.startsWith('NEXT_HTTP_ERROR_FALLBACK')
  );
}

/**
 * Run a server action and report whether it was reached.
 *
 * The action's own answer — `{ ok: false, reason: 'insufficient' }` and its
 * relatives — travels through untouched as `value`. This layer only ever
 * distinguishes *reached* from *not reached*; what a reached server decided is
 * the caller's business, and each surface answers a refusal in its own voice.
 */
export async function attempt<T>(run: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (cause) {
    if (isFrameworkControlFlow(cause)) throw cause;
    return { ok: false, unreachable: true };
  }
}

/**
 * What a surface says when the tap never reached the server.
 *
 * One sentence, in the shop's voice, kept here so that eight surfaces cannot
 * drift into eight different explanations of the same thing. It names the
 * gesture that fixes it, because *"something went wrong"* with no next step is
 * the failure mode this whole module exists to remove.
 */
export const UNREACHABLE_LINE = "That didn't reach Tony. Try it again.";
