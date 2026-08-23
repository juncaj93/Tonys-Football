import { type BlackjackOutcome, type SlotsState } from './game';

/** The three visible table chips. Kept separate from server execution for UI reuse. */
export const UNDERGROUND_WAGERS = [10, 20, 40] as const;
export type UndergroundWager = (typeof UNDERGROUND_WAGERS)[number];

/** Safe client view: blackjack's undealt deck never leaves the server. */
export type CasinoView =
  | {
      readonly id: string;
      readonly game: 'SLOTS';
      readonly wager: number;
      readonly settled: true;
      readonly payout: number;
      readonly reels: SlotsState['reels'];
    }
  | {
      readonly id: string;
      readonly game: 'BLACKJACK';
      readonly wager: number;
      readonly settled: boolean;
      readonly payout: number | null;
      readonly player: readonly string[];
      readonly playerValue: number;
      readonly dealer: readonly string[];
      readonly dealerValue: number | null;
      readonly outcome: BlackjackOutcome | null;
    };
