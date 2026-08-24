# Tony's Conversation Deck

**Status:** Approved by commissioner directive, 2026-08-24.

This is the deck Tony uses after a manager deliberately returns to talk. It is
not the arrival greeting. Every response is logged to that manager's private
conversation history; the most recent eight are never eligible again, and the
deck keeps a longer cooldown whenever it has alternatives.

## Ground rules

- A tag about a manager comes from the imported Sleeper history. No line names a
  person by hand, so the right person receives it as rosters change.
- Time and NFL-calendar lines only describe the current Eastern clock and
  calendar. They do not pretend the product knows an NFL result it has not
  verified.
- The `stats_*` lines may render only from an approved Sleeper fact packet. The
  same validator that protects the Tuesday Slice checks their names and numbers.
- Tony is dry, warm, and brief. No invented scores, no predictions treated as
  facts, no repeating catchphrase.

# Approved

## Time of day — the room should know when you came back

**T01** · `time_morning` · *pleased*
> Morning, {name}. Coffee first. Opinions after.

**T02** · `time_morning` · *neutral*
> {name}. The ovens are awake. That puts us ahead of most mornings.

**T03** · `time_morning` · *unimpressed*
> Early, {name}. Tony respects it. Tony does not understand it.

**T04** · `time_afternoon` · *neutral*
> Afternoon, {name}. The lunch rush is imaginary, but the vibes are holding.

**T05** · `time_afternoon` · *pleased*
> {name}. Midday check-in. The Bapple tree is still refusing to explain itself.

**T06** · `time_afternoon` · *neutral*
> Sun's up, {name}. The counter has seen worse afternoons.

**T07** · `time_evening` · *pleased*
> Evening, {name}. Booth lights are on. That means the important business can begin.

**T08** · `time_evening` · *neutral*
> {name}. Night shift. Same pizza, stronger opinions.

**T09** · `time_evening` · *unimpressed*
> Evening, {name}. Tony saved you a booth. Not the good booth.

**T10** · `time_late` · *neutral*
> {name}. Late enough for bad trade ideas. Too early to send them.

**T11** · `time_late` · *unimpressed*
> The sign says closed, {name}. Tony says the conversation can continue.

**T12** · `time_late` · *pleased*
> Quiet room, {name}. Even the pizza boxes are listening now.

## Football rhythm — calendar truth, never invented game results

**T13** · `nfl_thursday` · *pleased*
> Thursday, {name}. Football is clearing its throat.

**T14** · `nfl_thursday` · *neutral*
> {name}. Thursday has that first-whistle feeling. Tony likes it.

**T15** · `nfl_sunday` · *pleased*
> Sunday, {name}. Keep one eye on the games and one on the group chat. That's the job.

**T16** · `nfl_sunday` · *unimpressed*
> {name}. Sunday math: one score, ten opinions, zero peace.

**T17** · `nfl_monday` · *neutral*
> Monday, {name}. The week is not done being dramatic.

**T18** · `nfl_monday` · *pleased*
> {name}. One more football night. Tony has the booth ready.

**T19** · `nfl_tuesday` · *neutral*
> Tuesday, {name}. The Slice is where the receipts go when the shouting stops.

**T20** · `nfl_tuesday` · *unimpressed*
> {name}. Tuesday is for checking the tape and pretending the group chat was civil.

## Season rhythm

**T21** · `season_offseason` · *neutral*
> {name}. Offseason is just the league practicing how to be impatient.

**T22** · `season_offseason` · *pleased*
> No games yet, {name}. Plenty of time to make a roster look expensive.

**T23** · `season_offseason` + `{days}` · *neutral*
> {days} days out, {name}. The calendar's doing its part. Tony expects the rest from you.

**T24** · `kickoff_close` + `{days}` · *pleased*
> {days} days, {name}. The pizzas are preheating and so are the takes.

**T25** · `season_kickoff_week` · *unimpressed*
> Kickoff week, {name}. Nobody is calm; some people are lying about it.

**T26** · `season_in_season` · *neutral*
> {name}. In season now. Every booth has a theory and none of them agree.

**T27** · `season_in_season` · *pleased*
> The board is live, {name}. Tony likes a room with stakes.

## Your history — tags make these personal without guessing who is who

**T28** · `champion_2025` · *pleased*
> {name}. 2025 champ. The banner is big because subtlety would be dishonest.

**T29** · `champion_2025` · *neutral*
> {name}. Tony dusted the 2025 banner. You are welcome.

**T30** · `champion_2024` · *pleased*
> {name}. 2024 still looks good on the wall. Tony checked.

**T31** · `title_at_500_or_worse` · *unimpressed*
> {name}. Tony still cannot make seven and seven look like destiny. The ring disagrees.

**T32** · `most_points_2025` · *neutral*
> Most points in 2025, {name}. Tony keeps the receipt behind the counter.

**T33** · `best_record_2025` · *neutral*
> {name}. Best record in 2025. Tony remembers the regular season was very polite to you.

**T34** · `high_points_low_wins` · *unimpressed*
> {name}. Points came through in 2025. Luck took the service entrance.

**T35** · `most_points_against_2025` · *neutral*
> {name}. 2025 put a target on your booth. Tony saw the scoreboard.

**T36** · `fewest_points_2025` · *unimpressed*
> {name}. The 2025 score sheet is still on file. Tony will not read it out loud.

**T37** · `worst_record_2025` · *neutral*
> {name}. Bad seasons build character. Tony's not sure anybody ordered character.

**T38** · `made_playoffs_2025` + `never_champion` · *neutral*
> {name}. You got to January in 2025. The next room is still locked. For now.

**T39** · `runner_up_2024` · *neutral*
> {name}. One game short in 2024. Tony keeps the almost-rings in a very small drawer.

**T40** · `third_place_2024` · *pleased*
> {name}. Third in 2024 still gets a booth. Tony runs a generous establishment.

**T41** · `newest_manager` · *pleased*
> {name}. Still collecting evidence. So far, the chair fits.

**T42** · `newest_manager` · *neutral*
> New blood, {name}. Tony has no notes yet. Enjoy the peace.

**T43** · `inherited_slot` · *neutral*
> {name}. That seat has history. You get to decide whether it gets better.

## Team identity — Tony knows the name on the fantasy door

**T62** · `team_named` · *pleased*
> {team} checked in. {name} can take credit later; Tony keeps the receipts either way.

**T63** · `team_named` · *neutral*
> Tony has {team} on the board. The name is official. The excuses are still provisional.

**T64** · `team_named` + `time_morning` · *neutral*
> Morning, {team}. {name} got here before the first bad waiver idea. Promising.

**T65** · `team_named` + `time_evening` · *pleased*
> {team} has the evening booth. {name}, keep the group-chat scouting report off the napkins.

**T66** · `team_named` + `nfl_sunday` · *unimpressed*
> Sunday puts {team} on the clock. {name}, Tony has seen calmer people wait on a pizza.

**T67** · `team_named` + `nfl_tuesday` · *neutral*
> Tuesday receipt for {team}: {name} gets the headline; the scoreboard gets the last word.

**T68** · `team_named` + `season_offseason` · *pleased*
> {team} is already making offseason noise. {name}, Tony respects an early entrance.

**T69** · `team_named` + `season_in_season` · *neutral*
> {team} is in the book this week. {name}, every booth has a different forecast.

**T44** · `never_champion` + `two_plus_seasons` · *unimpressed*
> {name}. Tony believes in long arcs. The banner wall believes in proof.

## The room and the inside jokes

**T45** · *pleased*
> {name}. The Bapple cans are red because Tony respects a clear visual identity.

**T46** · *neutral*
> Tony checked on the Bapple tree again, {name}. Still cans. Still not apples.

**T47** · *pleased*
> {name}. The pizza boxes are collectibles now. Tony calls that progress.

**T48** · *neutral*
> The basement has a better ambience than most sports bars, {name}. Don't tell the basement.

**T49** · *pleased*
> {name}. If the lava lamp starts judging your lineup, Tony wants plausible deniability.

**T50** · *neutral*
> The CRT has opinions, {name}. They are mostly static, but still.

**T51** · *unimpressed*
> {name}. Do not ask Tony to explain the birth control detector. It knows what it did.

**T52** · *pleased*
> That Tony's Pizza Box belongs on a shelf, {name}. Tony has standards.

**T53** · *neutral*
> {name}. The Bumpy Cake is under guard. Loose frosting changes people.

**T54** · *pleased*
> The case is getting fuller, {name}. Tony notices collectors noticing.

## Sleeper-verified receipts — only when a publishable fact exists

**T55** · `stats_blowout` · *unimpressed*
> Sleeper's sheet has {winner} over {loser} by {margin}. Tony calls that a full pizza's worth of distance.

**T56** · `stats_blowout` · *neutral*
> {winner} put up {points} against {loser}. Tony filed the Sleeper receipt where everyone can see it.

**T57** · `stats_blowout` · *pleased*
> {winner} over {loser}, {margin} clear. Tony did not need a replay for that one.

**T58** · `stats_close_game` · *neutral*
> {winner} edged {loser} by {margin}. Sleeper calls it final; Tony calls it rude.

**T59** · `stats_close_game` · *pleased*
> {winner} got {points} past {loser}. Tony kept the receipt because close ones deserve evidence.

**T60** · `stats_champion` · *pleased*
> Sleeper's archive still puts {champion} on top for {season}. The banner stays up.

**T61** · `stats_champion` · *neutral*
> {champion}, {season}. Tony has the result in ink and the banner in frame.
