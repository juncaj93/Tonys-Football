# Managers — the names Tony uses

**This file is the source of truth for what a manager is called.** Edit it and
run `npm run db:seed`; the change is live.

## Why this file exists

Sleeper knows people by whatever username they picked, and a username is not a
name. Tony runs a pizzeria in a town where everybody knows everybody — he calls
Alex "Alex". `16 §4` keeps **permanent manager identity separate from seasonal
Sleeper roster identity** precisely so this can be true: the Sleeper account is
how the fantasy data is fetched, and the name below is who that is.

The import seeds a display name from Sleeper exactly once, on the first sight of
an account, and never overwrites it afterwards. This file is what overwrites it —
deliberately, from a file a person can read.

## How it works

**The Sleeper ID is the key, not the username.** Somebody changing their Sleeper
handle in October must not quietly detach them from their own history, and IDs
never change. The username column is there so the table can be read by a human;
nothing matches on it.

Every row is applied on every seed and is idempotent — a name already correct
reports no change.

**A manager not listed here keeps whatever Sleeper called them.** That is the
case for the three former occupants below: they held a roster in a past season,
they are not on the door, and nobody has told Tony their names.

## The current ten

| Sleeper ID | Sleeper username | Name |
|---|---|---|
| 450049619838103552 | BigJuncer | Alex |
| 993992889480904704 | MattyB2317 | Matty B |
| 705813167879553024 | RonJonathan | Ryan |
| 1119321313341976576 | MattLee04 | Matt Lee |
| 963870811994046464 | jfletcher433 | Joe |
| 1113259910768238592 | NateyDee | Nathan |
| 1113354275289223168 | SuggMyNick | Nick |
| 1113986962647654400 | imbrickedup22 | Brandon |
| 729470601756037120 | cheeseking | Cheese |
| 1385054341806686208 | zackstephens54 | Zack |

## Former occupants

Held a roster in 2024 or 2025 and are not in the current league. They keep their
Sleeper usernames until somebody says otherwise — the league's history mentions
them, so they need *a* name, and inventing one would be a fabrication.

| Sleeper ID | Sleeper username |
|---|---|
| 690209715904417792 | Anthonyberardo |
| 604375476017885184 | topouzzz |
| 1251952575964524544 | Tupaz11 |

## Rules

- **A name is exactly what the person is called.** Not a nickname Tony invented,
  not a variation. `12 §9` forbids inventing personality, and a name is the
  first piece of personality there is.
- **Two managers may not share a name.** The greeting says it out loud and the
  door lists it; two identical entries on the key rail is a worse problem than a
  long name. This is enforced, not advised — the seed refuses.
- **Changing a name here changes it everywhere**, including in greetings already
  written, because every line renders `{name}` at request time rather than
  storing it.
