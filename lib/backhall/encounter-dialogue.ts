/**
 * A visitor's small piece of conversation in the back hall.
 *
 * This is intentionally a **finite, reviewed canon deck**, rather than free
 * generated prose. The hall is a recurring, public-facing slice of the league:
 * every reference therefore comes either from a named Sleeper matchup or from
 * the approved character system. New league history belongs in the data layer,
 * not in a sentence guessed about a real person.
 */

export interface HallManager {
  readonly displayName: string;
  readonly teamName: string | null;
}

export interface HallMatchupReceipt {
  readonly week: number;
  readonly visitorPointsCents: number;
  readonly playerPointsCents: number;
}

export interface HallEncounterInput {
  readonly visitor: HallManager;
  readonly player: HallManager;
  /** A finalized, non-disputed matchup from the current Sleeper season only. */
  readonly receipt: HallMatchupReceipt | null;
  /** Changes the flavour, never the factual content, across return visits. */
  readonly beat: number;
  readonly isNight: boolean;
}

function team(manager: HallManager): string {
  const value = manager.teamName?.trim();
  return value === undefined || value === '' ? manager.displayName : value;
}

function moneylessPoints(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Approved non-factual lines. Each is deliberately short enough for the opaque
 * dialogue plaque on a phone, and none turns a profile note into a claim about
 * a person's private life or current behavior.
 */
const CANON_LINES: Readonly<Record<string, readonly string[]>> = {
  Alex: [
    'Alex studies a napkin covered in arrows. “Commissioner business. Definitely not another trade.”',
    'Alex checks the wall clock. “The league has a rule for this. It probably needs one more rule.”',
    'Alex nods at the counter. “Tony says the first banner is framed. He did not say who paid for the frame.”',
  ],
  Brandon: [
    'Brandon glances toward the stairs. “Freddy is somewhere in this building. Tony said: go see mumma.”',
    'Brandon gestures at the empty corner. “The portable sauna is not here. That is not an answer to a question.”',
    'Brandon looks at the hallway like he hosts it. “Nobody touch the good chair until draft night.”',
  ],
  Cheese: [
    'Cheese turns a token over once. “No action yet. Just appreciating the table.”',
    'Cheese watches the casino curtain. “A heater is a state of mind. Tony says that is not financial advice.”',
    'Cheese shrugs at the token machine. “The odds are the odds. The confidence is separate.”',
  ],
  Joe: [
    'Joe folds a trade note in half. “If it takes three days, it probably was not a trade.”',
    'Joe checks the pastry case. “The cookie tote is off duty. The decision-making is not.”',
    'Joe nods toward the back room. “Nathan can chase the legendary. I am here for a clean deal.”',
  ],
  'Matt Lee': [
    'Matt Lee points at the matchup board. “The trash talk is early. The receipts can catch up.”',
    'Matt Lee gives the room a confident nod. Tony writes nothing down, which is somehow worse.',
    'Matt Lee checks the door. “The league is still listening. Good.”',
  ],
  'Matty B': [
    'Matty B gives the banner wall a quick look. Tony mutters that competence is difficult to roast.',
    'Matty B is quietly checking the board. The room gets noticeably less dramatic for a second.',
    'Matty B nods once. Tony nods back, reluctantly impressed.',
  ],
  Nathan: [
    'Nathan peers through the case glass. “Legendary is still legendary, even when Tony says it is just pixels.”',
    'Nathan checks the collectible machine without touching it. The restraint is noted.',
    'Nathan eyes the display shelf. “Joe is not getting first pick of anything today.”',
  ],
  Nick: [
    'Nick looks toward the Bapple display. “Still cans.” Tony says that is all the explanation anybody gets.',
    'Nick folds a trade flyer and puts it back. “Drafted it. Keeping it.”',
    'Nick glances at the Lions memorabilia and the room immediately understands the assignment.',
  ],
  Ryan: [
    'Ryan scans the score board like it is one of several leagues open somewhere. Tony respects the range.',
    'Ryan keeps it calm for exactly one second. The competitive energy is still in the room.',
    'Ryan pauses by the Lions sign. “No predictions in the hallway.” A wise policy.',
  ],
  Zack: [
    'Zack takes in the room. Tony is still collecting evidence, but the booth is ready.',
    'Zack checks the board without saying much. New season, clean slate.',
    'Zack nods toward the Bapple case. Tony does not explain it. That is part of joining.',
  ],
};

function fallbackLine(visitor: HallManager, isNight: boolean): string {
  return isNight
    ? `${visitor.displayName} watches the warm light under the casino curtain. “No score predictions in the hallway.”`
    : `${visitor.displayName} is watching the Lions pregame chatter. “No score predictions in the hallway. That is bad luck.”`;
}

/**
 * A finished line for the visitor's dialogue plaque.
 *
 * The score receipt always wins over flavour: a verified matchup is more useful
 * than a lore callback. The no-receipt deck rotates on an input supplied by the
 * route, so visiting again later has a different beat without storing another
 * kind of conversation history.
 */
export function hallEncounterLine(input: HallEncounterInput): string {
  if (input.receipt !== null) {
    return `${input.visitor.displayName} taps the matchup receipt. “Week ${String(input.receipt.week)}: ${team(
      input.visitor,
    )} put up ${moneylessPoints(input.receipt.visitorPointsCents)}. ${team(input.player)} had ${moneylessPoints(
      input.receipt.playerPointsCents,
    )}. Tony calls that documentation.”`;
  }

  const lines = CANON_LINES[input.visitor.displayName];
  if (lines === undefined || lines.length === 0) return fallbackLine(input.visitor, input.isNight);
  return lines[Math.abs(input.beat) % lines.length] ?? fallbackLine(input.visitor, input.isNight);
}
