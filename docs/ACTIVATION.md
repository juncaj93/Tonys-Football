# Activation — Alex's launch checklist

**This is the only document you need.** Everything in Tony's is built and tested.
Five things are left, and every one of them is a human action that a session
cannot take for you.

Written for a phone. You do not need a Mac, a terminal, or any knowledge of how
any of it works. Each step is small, ordered, and reversible.

**The season opener is Thursday 10 September.** Nothing here is urgent today, and
the timing column tells you the real deadline for each item. There is no benefit
to waiting, and doing them early is completely safe.

---

## The five, in the order to do them

| # | Task | When it actually has to be done | Roughly |
|---|---|---|---|
| 1 | Set `CRON_SECRET` | **Before Sunday 13 September** | 5 min |
| 2 | Confirm the commissioner variable | Before Tuesday 15 September | 3 min |
| 3 | Check production for test accounts | Before you send the league the link | 3 min |
| 4 | Write one line of Tony's dialogue | Before you send the league the link | 5 min |
| 5 | Open the site on your phone and look | Before you send the league the link | 5–10 min |

Items 3, 4 and 5 are about the league's first impression. Items 1 and 2 are about
the season running itself.

---

## 1 · Set `CRON_SECRET`

**What it does.** Tony's has exactly two scheduled jobs, and this one value is the
only thing that lets them run. Until it is set they refuse every request —
including requests from the scheduler itself — which is deliberate: a job running
unprotected is a job whose missing lock nobody notices.

| Job | When it runs | What it does |
|---|---|---|
| `/api/cron/sunday` | Monday 00:55 ET (23:55 ET in winter) | Photographs Sunday night's scores, before Monday's game. The only way a "came back on Monday" story can be true |
| `/api/cron/tuesday` | Tuesday 05:00 ET | Reads the finished week from Sleeper, closes it, pays tokens, settles wagers, sets next week's board, and leaves a draft newspaper on your desk |

**Neither job publishes anything.** The newspaper waits for you.

### Steps

1. Open **vercel.com** and sign in.
2. Open the **Tonys-Football** project.
3. **Settings → Environment Variables**.
4. Tap **Add New**.
5. **Key:** `CRON_SECRET`
6. **Value:** a long random string — at least 32 characters, mixed letters,
   digits and symbols, not a word, not reused from anything else. Use your
   password manager's generator. This one value authorises closing a week and
   paying out tokens, so treat it like a password, not like a setting.
7. **Environment: Production only.** Untick Preview and Development. Preview
   builds have public URLs and point at a scratch database; one holding this
   value could close a week nobody is watching.
8. Save.
9. **Deployments → the most recent one → ⋯ → Redeploy.** The value is only picked
   up by deployments created after it was saved.

**Never paste the value into a chat, a message, a commit, or a screenshot.** It
does not need to be written down anywhere except your password manager. Nothing
in Tony's ever prints it.

### Check it worked

In Safari, open:

```
https://<your-site>/api/cron/tuesday
```

- **You should see a "not found" page.** That is correct — you have no secret in
  a browser address bar, so the door stays shut. If you see a JSON report here,
  stop and tell me: the door is open to anyone.

That is the only check you can do from a phone, and it is the important one. The
real proof is the next scheduled run: **Vercel → your project → Observability →
Crons** lists each firing and its result.

### Reading the result without misjudging it

Before the season starts, a successful run will say it did nothing — something
like *"week 1 holds no publishable game"*. **That is success, not failure.** Two
different things are being reported:

- **the door opened** — the job ran at all, rather than answering "not found";
- **there was football to process** — which only becomes true after week 1 is
  played.

A run in August that opens the door and reports nothing to do is exactly right.

### If you want to undo it

Delete the variable and redeploy. Both jobs go back to refusing everything and
nothing else changes — no data is written or unwritten by the switch, and every
operation either job performs is safe to repeat, so turning it back on later
simply picks up from wherever things are.

### Changing it later

Same steps with a new value. There is nothing to revoke: the old value stops
working the moment the new one deploys.

---

## 2 · Confirm the commissioner variable

**What it does.** `COMMISSIONER_SLEEPER_USER_ID` is what makes you the
commissioner. It holds your **Sleeper account id** — the number Sleeper uses for
you internally, not your username.

**If it is missing, nobody is an admin.** The office and the press desk answer
"not found" for everyone, which means **the weekly newspaper can never be
approved**, and the newspaper always needs a person to approve it. Nothing warns
you; the desk simply is not there.

### Steps

1. **vercel.com → Tonys-Football → Settings → Environment Variables.**
2. Look for `COMMISSIONER_SLEEPER_USER_ID`.
3. If it is present with a value in Production, you are done — do not change it.
4. If it is missing, add it, Production, and **redeploy**.

**Do not invent or change the identity.** If it is missing and you are unsure of
your Sleeper account id, tell me and I will find it from the league data already
imported — I can do that without touching production.

### Check it worked

Sign in on your phone, open **your keys** (the profile screen), and look for a
**Commissioner's office** button. If it is there, the approval path is open. Tap
through to **The press desk** — before the season it will be empty, which is
correct.

---

## 3 · Check production for test accounts

**Current status: not yet verified.** This is an accepted risk, not a finding
that the count is zero — nobody has looked.

Tony's creates temporary `demo:` accounts so screenshots can be taken
automatically. They cannot be created in production by design. This confirms the
design held.

**You will not need a database password.** Neon's own web console is already
signed in as you.

### Steps

1. Open **neon.tech** and sign in.
2. Choose the **Tony's** project, then the **production** branch (not `sandbox`).
3. Open the **SQL Editor**.
4. Paste this and run it. It only reads:

```sql
SELECT
  count(*) AS demo_users,
  count(*) FILTER (WHERE is_admin = true) AS demo_admins
FROM users
WHERE sleeper_user_id LIKE 'demo:%';
```

5. **Expected result: `0` and `0`.** If that is what you see, you are done — tell
   me and I will record it as verified.

### If it is not zero

**Do not delete anything.** Send me the two numbers only — no ids, no names.

- **`demo_users` above zero** is something to clean up carefully and in order.
- **`demo_admins` above zero** is more serious: it means an account that should
  not exist has commissioner powers. Stop, tell me, and do not sign anyone else
  in until it is resolved. Deletion, session invalidation and a credential review
  would all need to happen together.

---

## 4 · Write one line of Tony's dialogue

**Two managers currently hear the same greeting**, because the facts genuinely
tie and there is only one line written for that situation. Both lines are true;
they are just identical.

This is yours to write because Tony's voice is yours. It is one sentence.

### The collision

| | |
|---|---|
| **Who** | **Nick** and **Cheese** |
| **Why they tie** | Both made the 2025 playoffs and neither has ever won a title |
| **The line they share** | *"{name}. Playoffs in 2025. No ring at the end of it. Tony remembers both parts."* |

### What separates them, already in the data

**Cheese finished third in 2025** and Nick finished fourth. So one new line
written for the third-place finisher gives Cheese something of his own and leaves
Nick with the existing line.

Verified facts you can draw on, all already in the database:

- **Cheese** — 1 win and 13 losses in 2024 (worst in the league); 9–5 in 2025 and
  **third place**.
- **Nick** — 6–8 in 2024; 10–4 in 2025, the second-best record that year, and
  fourth place.

The turnaround is Cheese's real story: last in the league one season, on the
podium the next.

### The fill-in

Send me back this, filled in:

```
Manager to distinguish:  Cheese
Keyed to:                third_place_2025 + never_champion
Tony's expression:       neutral / pleased / unimpressed   (pick one)
The line:                ______________________________________________
```

### Rules the line has to follow

- Start it with `{name}` or include `{name}` somewhere — that is where his name
  is printed.
- **Under 180 characters**, including spaces. Shorter reads better.
- **Name the season** whenever you state a fact about one — "in 2025", not "this
  year". A line that says "last year" stops being true in January, and the file
  refuses those outright.
- Say something **true**. The facts above are verified from Sleeper.

I will place it in the file, run the checks, and confirm both managers now hear
different things. I have not written it myself because approved Tony dialogue is
yours, not an agent's.

---

## 5 · Open the site on your phone and look

Five to ten minutes, on your actual iPhone, on cellular if you can. This is not a
full test pass — the automated gate takes nearly three hundred screenshots every
time anything changes. This is the part a machine cannot do: *does it feel
right?*

Tap through in this order and glance at each:

1. **The site loads.** No blank screen, no spinner that never stops.
2. **Sign in.** Pick your name, enter your PIN. You should land in the parlor and
   **stay** there — if it bounces you back to the door, stop and tell me.
3. **The parlor.** Tony is standing behind the counter, not sunk into it. The
   room looks like a pizza shop, not a dashboard.
4. **Tonight at Tony's** — tap the big board. It should answer "what's new" in
   about five seconds of reading.
5. **One door.** Tap the newspaper rack, or the rear doorway. It should go
   somewhere and come back.
6. **Your receipt** — tap the slip in front of Tony. It should show *your* real
   2025 season.
7. **The counter and your collection.** Tokens on the receipt, and the shelf of
   twenty-four spots.
8. **The Timeline.** Champions, and each season's biggest win and closest game.
9. **Your keys** (profile). Your devices are listed and the sign-out buttons are
   there.
10. **Tony's Slice** — the newspaper rack. Before the season it shows the
    historical issue, which is correct.
11. **The office**, if you did step 2 — commissioner's office → the press desk.

Also just notice:

- nothing is cut off at the edge of the screen;
- nothing needs pinching to read;
- no page is obviously showing stale placeholder data where real data should be;
- no picture is missing or broken.

**If something looks wrong, a screenshot and one sentence is enough.** Do not try
to diagnose it.

### Already done, and it does not tick this box

On 2026-08-09 you opened the live site on your iPhone, went into the character
editor, changed something and saved it, and it worked — which confirmed the fix
for the server-side exception that used to happen there (`docs/OPEN_ITEMS.md`
**A2**).

That is real production evidence and it is recorded as such. It is **not** this
step: character customisation is not one of the eleven above, and the eleven are
what this step is. The list is unchanged.

---

## What is deliberately not on this list

So none of it reads as forgotten:

- **Twelve of the twenty-four collectibles draw a plain pizza box.** That is the
  agreed launch commitment, not missing art.
- **Tony's Line** — the weekly over/under — is built and switched off for the
  first season. It needs a season's worth of scores before its number means
  anything.
- **The casino, manager basements, the auction, seasonal events, the vending
  machine, the ring ceremony, the season story** are all later. Roulette is never.
- **Rooms and the Underground** are behind their doors on purpose, so the room
  feels like an arrival when they open.

---

## When you are done

Tell me which of the five you completed and anything odd you saw. I will record
what is actually verified — and only what is actually verified.
