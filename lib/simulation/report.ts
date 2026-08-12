import { type PreseasonPacket } from '@/lib/slice/preseason';
import { type FactPacket } from '@/lib/slice/packet';
import { type Edition } from '@/lib/slice/render';
import { type StandingRow } from '@/lib/stats/standings';

import { type SimulationRecord } from './lab';

/**
 * The simulation report — what went in, what the product did with it, and what
 * it refused to say.
 *
 * ## It asserts nothing
 *
 * The same split `scripts/rehearse.ts` uses and for the same reason:
 * `lib/simulation/lab.test.ts` is the gate and this is the evidence. Two things
 * that both check are two places to disagree, and the disagreement is invisible
 * because both are green.
 *
 * ## It prints the refusals as prominently as the prose
 *
 * A report that only showed the paper would answer half the commissioner's
 * question. *"Tony declined to call that a blowout"* and *"there was no basis
 * for a bounty"* are product behaviour, deliberately, and the sections below
 * give them the same weight as the headline. Where the record holds a refusal,
 * the report prints the product's own word for it rather than a paraphrase.
 */

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function standingsTable(rows: readonly StandingRow[]): string {
  if (rows.length === 0) return '_No week has been played, so there is no table._';
  return table(
    ['#', 'Manager', 'W–L–T', 'Points for'],
    [...rows]
      .sort((left, right) => left.rank - right.rank || left.rosterId - right.rosterId)
      .map((row) => [
        String(row.rank),
        row.displayName ?? `roster ${String(row.rosterId)}`,
        `${String(row.wins)}–${String(row.losses)}–${String(row.ties)}`,
        money(row.pointsForCents),
      ]),
  );
}

function isPreseasonPacket(packet: FactPacket | PreseasonPacket): packet is PreseasonPacket {
  return 'kind' in packet && packet.kind === 'preseason';
}

/** The paper, printed as prose rather than as JSON. This is the deliverable. */
function paper(issue: Edition): string {
  const lines: string[] = [];

  lines.push('```', `TONY'S TUESDAY SLICE`, issue.dateline, '');

  if (issue.nothingToPrint !== null) {
    lines.push(`[nothing to print]  ${issue.nothingToPrint}`, '');
  }

  if (issue.headline !== '') {
    lines.push(issue.headline);
    if (issue.deck !== null) lines.push(`  ${issue.deck}`);
    if (issue.body !== '') lines.push('', `  ${issue.body}`);
    lines.push('');
  }

  for (const story of issue.secondary) {
    lines.push(`— ${story.headline}`);
    if (story.deck !== null) lines.push(`  ${story.deck}`);
    if (story.body !== '') lines.push(`  ${story.body}`);
    lines.push('');
  }

  const pre = issue.preseason;
  if (pre !== undefined) {
    lines.push("TONY'S DRAFT BOARD");
    for (const row of pre.board) lines.push(`  ${row.grade.padEnd(3)} ${row.manager}`);
    lines.push('');

    if (pre.snapshot.length > 0) {
      lines.push('FROM THE DRAFT ROOM');
      for (const row of pre.snapshot) lines.push(`  ${row.label}: ${row.value}`);
      lines.push('');
    }

    lines.push('TEAM BY TEAM');
    for (const team of pre.teams) {
      lines.push(`  ${team.grade.padEnd(3)} ${team.manager}`);
      lines.push(`      ${team.take}`);
      if (team.slot !== null) lines.push(`      ${team.slot}`);
      for (const shape of team.shape) lines.push(`      · ${shape}`);
      if (team.bestPick !== null) lines.push(`      · ${team.bestPick}`);
      if (team.concern !== null) lines.push(`      · ${team.concern}`);
      if (team.positions !== null) lines.push(`      ${team.positions}`);
      if (team.picks.length > 0) {
        lines.push(`      picks: ${team.picks.map((pick) => `${pick.label} ${pick.player}`).join(' · ')}`);
      }
      lines.push('');
    }

    if (pre.history.length > 0) {
      lines.push('FOR THE RECORD');
      for (const row of pre.history) lines.push(`  ${row.label}: ${row.value}`);
      lines.push('');
    }

    if (pre.weekOne.length > 0) {
      lines.push('WEEK ONE');
      for (const game of pre.weekOne) lines.push(`  ${game.left} v ${game.right}`);
      lines.push('');
    }
  }

  if (issue.scoreboard.length > 0) {
    lines.push('THE BOARD');
    for (const score of issue.scoreboard) {
      lines.push(
        score.tie
          ? `  ${score.leftName} ${score.leftPoints} ties ${score.rightName} ${score.rightPoints}`
          : score.leftWon
            ? `  ${score.leftName} ${score.leftPoints} over ${score.rightName} ${score.rightPoints}`
            : `  ${score.rightName} ${score.rightPoints} over ${score.leftName} ${score.leftPoints}`,
      );
    }
    lines.push('');
  }

  if (issue.column !== '') lines.push('TONY’S COLUMN', `  ${issue.column}`, '');

  lines.push('```');
  return lines.join('\n');
}

/** Everything the product declined to say, in its own vocabulary. */
function refusals(record: SimulationRecord): readonly string[] {
  const lines: string[] = [];
  const featured = record.tuesdays.at(-1)?.report;

  if (featured !== undefined) {
    if (featured.skipped.length > 0) {
      lines.push('**Steps the Tuesday job declined**, in its own words:', '');
      for (const line of featured.skipped) lines.push(`- ${line}`);
      lines.push('');
    }
    if (featured.draft?.refusal != null) {
      lines.push(`**The draft refused:** \`${featured.draft.refusal}\``, '');
    }
    if (featured.failed.length > 0) {
      lines.push(`**Steps that threw:** \`${JSON.stringify(featured.failed)}\``, '');
    }
  }

  const packet = record.desk?.packet;
  if (packet !== undefined && !isPreseasonPacket(packet)) {
    if (packet.refusal !== null) lines.push(`**The fact packet refused:** \`${packet.refusal}\``, '');

    if (packet.suppressed.length > 0) {
      lines.push(
        '**Suppressed** — a candidate the desk had and did not print:',
        '',
        table(
          ['Story', 'Why'],
          packet.suppressed.map((entry) => [`\`${entry.id}\``, `${entry.reason} — ${entry.detail}`]),
        ),
        '',
      );
    } else {
      lines.push('**Suppressed:** none. Nothing was held back.', '');
    }

    if (packet.demoted.length > 0) {
      lines.push(
        '**Demoted** — printed, but not where it wanted to be:',
        '',
        table(
          ['Story', 'Why'],
          packet.demoted.map((entry) => [`\`${entry.id}\``, entry.detail]),
        ),
        '',
      );
    }

    if (packet.quiet) {
      lines.push(
        '**The week ran quiet.** Nothing cleared the significance floor, so the paper prints ' +
          'the board and says so rather than promoting a story that had not earned one.',
        '',
      );
    }
  }

  if (packet !== undefined && isPreseasonPacket(packet)) {
    if (packet.refusal !== null) {
      lines.push(`**The preseason packet refused:** \`${packet.refusal}\``, '');
    }
    if (packet.outstanding.length > 0) {
      lines.push(
        `**${String(packet.outstanding.length)} boards ungraded**, so the issue cannot print: ` +
          packet.outstanding.join(', '),
        '',
      );
    }
  }

  const verdict = record.desk?.verdict;
  if (verdict !== undefined) {
    lines.push(
      verdict.publishable
        ? '**The validator passed the whole issue.** Every number and every proper noun in the ' +
            'prose was declared by the packet first.'
        : `**The validator refused it:** ${verdict.violations
            .map((violation) => `\`${violation.kind}\` ${violation.value}`)
            .join(', ')}`,
      '',
    );
  }

  return lines;
}

export function renderSimulationReport(record: SimulationRecord): string {
  const { scenario } = record;
  const featured = record.tuesdays.at(-1)?.report;
  const desk = record.desk;

  const out: string[] = [
    '<!--',
    `  GENERATED by \`npm run simulate -- ${scenario.key}\`. Do not edit by hand.`,
    '  The assertions live in `lib/simulation/lab.test.ts`; this is the evidence.',
    '-->',
    '',
    `# ${scenario.title}`,
    '',
    `> ${scenario.premise}`,
    '',
    '**Every score below is simulation input.** It exists inside a throwaway local database,',
    'no production surface can reach it, and nothing here is a claim about football. Sleeper',
    'remains the source of truth in production. **Everything the product did with it —',
    'the sync, the close, the selection, the prose and the refusals — is the shipping code.**',
    '',
    '---',
    '',
    '## 1. What went in',
    '',
  ];

  if (record.arrangement.length > 0) {
    for (const note of record.arrangement) out.push(`- ${note}`);
    out.push('');
  }

  out.push(
    `Weeks played through the real Tuesday cron before the featured week: **${String(
      Math.max(0, scenario.through - 1),
    )}**.`,
    '',
    '### The table going in',
    '',
    standingsTable(record.standingsBefore),
    '',
  );

  if (scenario.featured !== null) {
    const week = scenario.featured;
    const games = record.after.games.filter((game) => game.week === week);
    out.push(
      `### Week ${String(week)}, as played`,
      '',
      table(
        ['Game', 'Home', 'Away', 'Score', 'Winner'],
        games.map((game) => [
          `m${String(game.matchupId)}`,
          scenario.seats[game.rosterA] ?? String(game.rosterA),
          scenario.seats[game.rosterB] ?? String(game.rosterB),
          `${game.pointsA.toFixed(2)} – ${game.pointsB.toFixed(2)}`,
          game.winner === null ? 'tie' : (scenario.seats[game.winner] ?? String(game.winner)),
        ]),
      ),
      '',
    );

    const snapshot = record.after.snapshots.filter((row) => row.week === week);
    out.push(
      record.sunday === null
        ? '_No pre-Monday photograph was taken for this week._'
        : `**Sunday photographed ${String(snapshot.length)} games** before Monday night, in ` +
            `${String(record.sunday.requests)} Sleeper requests. This scenario's scoreboard ` +
            'carries one score line per game, so the photograph equals the close and **no Monday ' +
            'comeback is derivable** — a property of the input, not a limitation of the product.',
      '',
    );
  }

  out.push('---', '', '## 2. What the Tuesday job did', '');

  if (featured === undefined) {
    out.push('_The featured Tuesday did not run._', '');
  } else {
    out.push(
      table(
        ['Step', 'Result'],
        [
          ['sync', featured.sync?.refusal ?? `read cleanly · ${String(featured.sync?.summary?.recordsChanged ?? 0)} records changed`],
          ['week resolved', String(featured.week)],
          ['finalize', featured.finalized ? `closed over ${String(featured.games)} games` : 'not closed by this run'],
          ['settle', JSON.stringify(featured.settled)],
          ['rewards', `${String(featured.rewards?.paid.length ?? 0)} paid · ${String(featured.rewards?.tokens ?? 0)} tokens`],
          ['grants', `${String(featured.grants?.granted ?? 0)} granted`],
          ['author', `${String(featured.authored)} offers written for the next week`],
          ['draft', `${featured.draft?.outcome ?? 'none'}${featured.draft?.refusal == null ? '' : ` (${featured.draft.refusal})`}`],
          ['which paper', featured.issueKind],
        ],
      ),
      '',
      '**It did not publish**, and there is no parameter that would let it. `submit: true` is the',
      'last thing it does; the draft lands on the press desk and stops (`16 §9`).',
      '',
    );
  }

  out.push('---', '', '## 3. What Tony derived', '');

  const packet = desk?.packet;
  if (packet === undefined) {
    out.push('_No draft reached the desk, so there is no packet to show._', '');
  } else if (isPreseasonPacket(packet)) {
    out.push(
      table(
        ['Fact', 'Value'],
        [
          ['season', String(packet.season)],
          ['draft status', packet.draft?.status ?? '—'],
          ['rounds', String(packet.draft?.rounds ?? 0)],
          ['picks', String(packet.draft?.totalPicks ?? 0)],
          ['boards graded', `${String(packet.reviewed)} of ${String(packet.total)}`],
          ['defending champion', packet.champion === null ? 'none printable' : `${packet.champion.displayName} (${String(packet.champion.season)})`],
          ['week one fixtures', String(packet.weekOne.length)],
          ['league-wide observations', String(packet.draft?.observations.length ?? 0)],
        ],
      ),
      '',
      '**No grade, ranking or judgement here was computed.** The observations are countable facts',
      'from stored picks; the grades and takes are editorial input. `docs/PRESEASON_SLICE_BOUNDARY.md §5`',
      'makes that permanent — there is no ADP, no projection and no value model in this product.',
      '',
    );
    if ((packet.draft?.observations.length ?? 0) > 0) {
      out.push(
        '**The observations the draft actually supported:**',
        '',
        ...(packet.draft?.observations ?? []).map(
          (observation) =>
            `- \`${observation.kind}\` — ${Object.entries(observation)
              .filter(([field]) => field !== 'kind')
              .map(([field, value]) => `${field}: ${String(value)}`)
              .join(', ')}`,
        ),
        '',
      );
    }
  } else {
    out.push(
      table(
        ['Fact', 'Value'],
        [
          ['week', `${String(packet.season)} week ${String(packet.week)} (${packet.weekType})`],
          ['finalized', packet.finalized ? 'yes' : 'no'],
          ['lead story', packet.lead === null ? '— none cleared the floor' : `\`${packet.lead.kind}\` · significance ${String(packet.lead.significance)}`],
          ['other stories', String(packet.rest.length)],
          ['publishable games', String(packet.scoreboard.length)],
          ['numbers the prose may use', String(packet.allowedNumbers.length)],
          ['names the prose may use', String(packet.allowedNames.length)],
        ],
      ),
      '',
    );

    const candidates = [packet.lead, ...packet.rest].filter((entry) => entry !== null);
    if (candidates.length > 0) {
      out.push(
        '**The candidates that survived selection**, with the evidence behind each:',
        '',
        table(
          ['Kind', 'Significance', 'Evidence'],
          candidates.map((entry) => [
            `\`${entry.kind}\``,
            String(entry.significance),
            entry.evidence.join(' · '),
          ]),
        ),
        '',
      );
    }
  }

  out.push('---', '', '## 4. What Tony refused to say', '', ...refusals(record));

  out.push('---', '', '## 5. The wagers', '');

  const stakes = record.after.stakes;
  if (stakes.length === 0) {
    out.push(
      '**Nothing was authored and nothing settled.** A personal line needs three of that ' +
        "manager's own team-weeks, a bounty needs twelve prior team-weeks, and a chalkboard " +
        'question needs a prior Tuesday. This scenario reaches none of them.',
      '',
    );
  } else {
    const settledBy = new Map(record.after.resolutions.map((row) => [row.stakeKey, row.outcome]));

    /* ---------------------------------------------------------- the line -- */

    const lines = stakes.filter((stake) => stake.kind === 'TONYS_LINE');
    out.push("### Tony's Line — one number per manager", '');

    if (lines.length === 0) {
      out.push(
        '_No line was authored. A personal line needs three of that manager\'s own ' +
          'team-weeks behind it, which the league reaches in week four._',
        '',
      );
    } else {
      const newest = Math.max(...lines.map((line) => line.week));
      const latest = [...lines]
        .filter((line) => line.week === newest)
        .sort(
          (left, right) =>
            Number(left.factRefs.values['rosterId'] ?? 0) -
            Number(right.factRefs.values['rosterId'] ?? 0),
        );

      out.push(
        `Week ${String(newest)}, the newest the scenario authored. Every number is that ` +
          "manager's own scoring median pulled toward the league's, hung on the half point so " +
          'no score can land on it.',
        '',
        table(
          ['Manager', 'Line', 'Own weeks', 'Cleared it recently', 'Offered to'],
          latest.map((line) => [
            line.factRefs.values['subject'] ?? '—',
            line.factRefs.values['line'] ?? '—',
            line.factRefs.values['ownTeamWeeks'] ?? '—',
            line.factRefs.values['cleared'] === undefined
              ? '—'
              : `${line.factRefs.values['cleared']} of ${line.factRefs.values['clearedOf'] ?? '?'}`,
            String(line.eligibleUserIds.length),
          ]),
        ),
        '',
        '**One manager per row, and the last column is the point.** Each of those stakes ' +
          'carries an eligibility snapshot of exactly one person, and `stake_entries` has a ' +
          'trigger refusing anybody else — so a manager cannot take a side on somebody ' +
          "else's team total however they reach the table.",
        '',
      );
    }

    /* ---------------------------------------------------- the chalkboard -- */

    const calls = stakes
      .filter((stake) => stake.kind === 'CHALKBOARD')
      .sort((left, right) => left.week - right.week);

    out.push("### Tony's Chalkboard — one shared call a week", '');

    if (calls.length === 0) {
      out.push('_No question was written up._', '');
    } else {
      const decided = calls.filter((call) => settledBy.has(call.stakeKey));
      const right = decided.filter((call) => settledBy.get(call.stakeKey) === 'hit').length;

      out.push(
        table(
          ['Week', 'Question', 'Number', 'Tony', 'How it went'],
          calls.map((call) => [
            String(call.week),
            `\`${call.variant}\``,
            call.factRefs.values['line'] ?? call.factRefs.values['margin'] ?? '—',
            'yes',
            settledBy.get(call.stakeKey) === 'hit'
              ? 'right'
              : settledBy.get(call.stakeKey) === 'missed'
                ? 'wrong'
                : '—',
          ]),
        ),
        '',
        decided.length === 0
          ? '**Nothing has settled yet, so Tony has no record.** The sentence is absent ' +
            'rather than zeroed.'
          : `**Tony was right ${String(right)} of ${String(decided.length)}.** Counted off ` +
            '`stake_resolutions` and never hand-authored — possible only because he backs ' +
            'the affirmative every time, so `hit` means *the proposition happened* and ' +
            '*Tony was right* at once.',
        '',
        '**Nobody wagered on any of it.** Every row above carries a null stake and a null ' +
          'reward, and the surface renders no control on a `CHALKBOARD` row.',
        '',
      );
    }

    /* -------------------------------------------------------- everything -- */

    out.push(
      '### Everything the season authored',
      '',
      table(
        ['Kind', 'Week', 'Status', 'Outcome'],
        stakes.map((stake) => [
          `\`${stake.kind}\``,
          String(stake.week),
          stake.status,
          settledBy.get(stake.stakeKey) ?? '—',
        ]),
      ),
      '',
    );
  }

  out.push('---', '', '## 6. The paper', '');
  if (desk?.edition === undefined) {
    out.push('_Nothing was drafted, so there is no paper._', '');
  } else {
    out.push(paper(desk.edition), '');
  }

  const look = record.retrospective;
  if (look !== null) {
    out.push('---', '', '## 6a. The same week, a week later', '');
    const gained = look.kindsAfterwards.filter((kind) => !look.kindsOnTheDay.includes(kind));
    out.push(
      table(
        ['', 'On the Tuesday it printed', `Re-assembled after week ${String(look.throughWeek)}`],
        [
          ['lead', `\`${look.leadOnTheDay ?? 'none'}\``, `\`${look.leadAfterwards ?? 'none'}\``],
          [
            'story kinds available',
            look.kindsOnTheDay.map((kind) => `\`${kind}\``).join(' · ') || '—',
            look.kindsAfterwards.map((kind) => `\`${kind}\``).join(' · ') || '—',
          ],
        ],
      ),
      '',
      gained.length === 0
        ? '**Nothing became sayable later.** The week reads the same either way.'
        : `**${gained.map((kind) => `\`${kind}\``).join(', ')} became sayable only afterwards.** ` +
            'The fact it rests on is written from the bracket when the *final* is synced, so on ' +
            'the Tuesday of the semifinal it did not exist yet. That is deliberate — ' +
            '`docs/OPEN_ITEMS.md` **G5** declines persisting playoff structure for v1, and the ' +
            'story reads the recorded placement rather than inferring one.',
      '',
      `**The published issue did not move.** Its headline is still ` +
        `_${look.publishedHeadlineAfterwards ?? '—'}_ — a version's content is immutable by ` +
        'trigger, so a later fact produces a **new** version rather than editing a printed one.',
      '',
    );
  }

  out.push('---', '', '## 7. The desk', '');
  if (desk === null || record.publication === null) {
    out.push('_Nothing reached the press desk._', '');
  } else {
    out.push(
      table(
        ['', ''],
        [
          ['issue', `${String(desk.season)} week ${String(desk.week)} · kind \`${desk.kind}\``],
          ['version', String(desk.version)],
          ['content hash', `\`${desk.contentHash}\``],
          ['status when the cron finished', `\`${record.publication.statusBeforeApproval}\``],
          ['validator', desk.publishable ? 'passed' : 'refused'],
          ['approved by', record.publication.approvedBy],
          ['published by', record.publication.publishedBy],
          ['status now', `\`${record.publication.statusAfterPublication}\``],
        ],
      ),
      '',
      '**The review history, as the database recorded it:**',
      '',
      table(
        ['Action', 'Actor'],
        desk.history.map((event) => [`\`${event.action}\``, event.actorName ?? '—']),
      ),
      '',
      'The approval names a person because the database refuses one that does not. A cron cannot',
      'reach either stamp.',
      '',
    );
  }

  out.push(
    '---',
    '',
    '## 8. Where the database ended',
    '',
    table(
      ['What', 'Count'],
      [
        ['Seats', String(record.after.seats.length)],
        ['Stored games', String(record.after.games.length)],
        ['Snapshots', String(record.after.snapshots.length)],
        ['Closed weeks', String(record.after.finalizations.length)],
        ['Rewards', String(record.after.rewards.length)],
        ['Ledger rows', String(record.after.ledger.length)],
        ['Stakes authored', String(record.after.stakes.length)],
        ['Stake resolutions', String(record.after.resolutions.length)],
        ['Slice versions', String(record.after.versions.length)],
      ],
    ),
    '',
    '### The table after the featured week',
    '',
    standingsTable(record.standingsAfter),
    '',
  );

  return out.join('\n');
}
