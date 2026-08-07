/**
 * How this product prints a moment.
 *
 * The type case (`lib/design/type.ts`) decided how words are sized once, in one
 * place, because sixteen font sizes had accumulated across two hundred call
 * sites. This is the same move for **time**, made before the accumulation
 * rather than after it: until now **no user-facing surface formatted a date at
 * all**, and visual debt 11 waited precisely because adding one to the Slice
 * review record would have committed the whole product to a convention chosen
 * inside a screen about publication governance.
 *
 * So the convention lives here, with its reasons, and the record uses it.
 *
 * ## The league's clock is Eastern, and every stamp says so
 *
 * `lib/parlor/season.ts` already counts the league's *days* in
 * `America/New_York` — a greeting turns over at midnight in Michigan rather
 * than at whatever hour the server thinks it is. A displayed time that used a
 * different zone from the one the product already reasons in would be a second
 * clock, and two clocks disagree eventually.
 *
 * The zone is **printed**, not assumed. An audit record that says `3:02 PM` and
 * nothing else is ambiguous to anyone who is not in Michigan, and an audit
 * record's whole job is to be unambiguous later.
 *
 * `EDT`/`EST` rather than a flat `ET`, because they pin the actual offset. A
 * review that happened during the changeover is exactly the case a record has
 * to survive.
 *
 * ## The month is a word
 *
 * `06/08/2026` is 6 August or 8 June depending on the reader, and there is no
 * way to tell from the string. For an audit trail that is not a style
 * preference, it is a defect. `6 Aug 2026` cannot be misread.
 *
 * ## It is assembled from parts, not from a format string
 *
 * `Intl.DateTimeFormat(...).format()` with both a date and a time inserts a
 * connector — `at`, in current ICU — and which connector, or whether there is
 * one, has changed between ICU versions. That would make the output depend on
 * the Node build rather than on the code, which is unacceptable for something a
 * screenshot gate photographs and a test pins.
 *
 * `formatToParts` hands over the pieces and this file decides the order and the
 * punctuation. The locale is fixed for the same reason the zone is: the server's
 * idea of where it is must never reach the page.
 *
 * ## There is no relative time, and that is a decision
 *
 * No `2 hours ago`. It is the obvious thing to want on a record and it is wrong
 * here twice over: it is **not deterministic**, so the same row photographs
 * differently on every run and the visual gate could never assert it; and it
 * **loses the fact**, which is the one thing an audit trail may not do. *"When
 * was this approved"* wants an answer that is still true next year.
 *
 * `lib/design/moment.test.ts` asserts the absence, so it stays a decision rather
 * than becoming an omission somebody helpfully fills in.
 */

/**
 * The zone the league lives in.
 *
 * Exported so a caller can be checked against it rather than repeating the
 * string. `lib/parlor/season.ts` uses the same zone for day boundaries; if these
 * two ever disagree the product has two clocks.
 */
export const LEAGUE_ZONE = 'America/New_York';

/**
 * Fixed locale, fixed zone. Neither is a default, and neither may be a default:
 * both would otherwise be read from the machine the server happens to be on.
 */
const STAMP_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: LEAGUE_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

const DAY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: LEAGUE_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** Pull one piece out of a formatted run, or an empty string if it is absent. */
function part(pieces: readonly Intl.DateTimeFormatPart[], type: string): string {
  return pieces.find((piece) => piece.type === type)?.value ?? '';
}

/**
 * A precise moment, for a record that has to be believed later.
 *
 * `6 Aug 2026, 3:02 PM EDT`
 *
 * Day-first so the two numbers a reader scans for — the day and the year — sit
 * at the ends rather than either side of a word they have to read past.
 */
export function stamp(instant: Date): string {
  const pieces = STAMP_PARTS.formatToParts(instant);
  const date = `${part(pieces, 'day')} ${part(pieces, 'month')} ${part(pieces, 'year')}`;
  const time = `${part(pieces, 'hour')}:${part(pieces, 'minute')}`;
  /*
   * Upper-cased here rather than left to CSS. The role that prints these is
   * `TYPE.metadata`, which happens to uppercase — but a string that only reads
   * correctly under one stylesheet is not a formatted string, and tests assert
   * the value rather than the rendering.
   */
  const meridiem = part(pieces, 'dayPeriod').toUpperCase();
  const zone = part(pieces, 'timeZoneName').toUpperCase();
  return `${date}, ${time} ${meridiem} ${zone}`;
}

/**
 * A calendar day, where the time of day is not part of the fact.
 *
 * `6 Aug 2026` — the day in Michigan, matching `easternDayKey`'s boundaries.
 */
export function day(instant: Date): string {
  const pieces = DAY_PARTS.formatToParts(instant);
  return `${part(pieces, 'day')} ${part(pieces, 'month')} ${part(pieces, 'year')}`;
}
