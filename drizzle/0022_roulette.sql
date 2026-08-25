-- Roulette is a fully resolved single-zero round.  It uses the existing wager,
-- payout and immutable casino-round ledger; only the game enum expands.
ALTER TYPE "public"."casino_game" ADD VALUE IF NOT EXISTS 'ROULETTE';
