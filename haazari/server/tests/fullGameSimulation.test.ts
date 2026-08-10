import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HaazariGame } from '../src/game/gameEngine.js';
import { GAME_RULES } from '../src/game/rules.js';
import { PLAYERS, ARRANGED_SETS, buildDeckForSeating } from './fixtures/validRound.js';
import { seatingOrderFromDealer } from '../src/game/deck.js';

beforeEach(() => {
  GAME_RULES.TEST_MODE = true;
});
afterEach(() => {
  GAME_RULES.TEST_MODE = false;
});

/**
 * SECTION 54 - FULL GAME SIMULATION
 *
 * Uses the hand-verified fixture (tests/fixtures/validRound.ts) - the SAME
 * 4 arrangements are re-dealt every round (deterministic, TEST_MODE), whose
 * known outcome is: Set1->P1 (110pts), Set2/3/4->P4 (85+75+90=250pts),
 * P2/P3 get 0 each round. That means every completed round adds exactly
 * +110 to P1 and +250 to P4's cumulative score, so P4 crosses the 1000
 * WINNING_SCORE threshold at the end of round 4 (250*4=1000), while the
 * round is always allowed to finish first (END_GAME_IMMEDIATELY_AT_1000
 * is false), matching Section 26-27.
 */
describe('Full game simulation (Section 54)', () => {
  it('plays a complete multi-round game end-to-end to a 1000+ winner', () => {
    // 1-2. Create a room, "join" four players (constructor = room+players joined).
    const game = new HaazariGame('HZR482', PLAYERS, 'P1'); // 3. dealer selected (fixed for determinism)

    const MAX_ROUNDS = 10; // safety cap - real game should finish in 4
    let roundsPlayed = 0;
    const dealerSequenceSeen: string[] = [];

    while (game.state !== 'GAME_COMPLETE' && roundsPlayed < MAX_ROUNDS) {
      dealerSequenceSeen.push(game.dealerId);

      // 4-6. Shuffle (skipped via TEST_MODE) + deal 52 cards, 13 to each player, clockwise from dealer.
      const seating = seatingOrderFromDealer(PLAYERS, game.dealerId);
      const testDeck = buildDeckForSeating(seating);
      game.dealNewRound(testDeck);

      // Verify dealing invariants every round (Section 53 "Dealing tests").
      const allDealt = PLAYERS.flatMap((p) => game.getPlayerHand(p));
      expect(allDealt.length).toBe(52);
      expect(new Set(allDealt.map((c) => c.id)).size).toBe(52);
      for (const p of PLAYERS) expect(game.getPlayerHand(p).length).toBe(13);

      // 7. Validate/arrange hands for all 4 players.
      for (const p of PLAYERS) {
        const result = game.confirmArrangement(p, ARRANGED_SETS[p]);
        expect(result.ok).toBe(true);
      }
      expect(game.state).toBe('PLAYING_SET_1');

      // 8-19. Play all 4 sets, each fully revealing/scoring/leader-advancing automatically.
      for (let setIdx = 0; setIdx < 4; setIdx++) {
        const order = game.getCurrentPlayOrder();
        expect(order.length).toBe(4);
        for (const pid of order) game.playSet(pid);
      }

      // 20. Verify total round points = 360 (engine already throws internally
      // if this invariant fails - reaching here without a throw IS the proof,
      // but we also re-derive it from history for an explicit assertion).
      const lastRound = game.roundHistory[game.roundHistory.length - 1];
      expect(lastRound.dismissed).toBe(false);
      const roundTotal = Object.values(lastRound.pointsThisRound).reduce((a, b) => a + b, 0);
      expect(roundTotal).toBe(360);

      // Known deterministic outcome for this fixture.
      expect(lastRound.pointsThisRound.P1).toBe(110);
      expect(lastRound.pointsThisRound.P2).toBe(0);
      expect(lastRound.pointsThisRound.P3).toBe(0);
      expect(lastRound.pointsThisRound.P4).toBe(250);

      roundsPlayed++;
      // 21-23. cumulative scores already updated internally; dealer already
      // rotated internally when completeRound() ran (unless game just ended).
    }

    // 24-25. Continue until winning condition reached; declare winner.
    expect(game.state).toBe('GAME_COMPLETE');
    expect(roundsPlayed).toBe(4); // 250*4 = 1000, hits exactly at round 4

    const winner = game.getWinner();
    expect(winner).toBe('P4');
    expect(game.cumulativeScores.P4).toBeGreaterThanOrEqual(GAME_RULES.WINNING_SCORE);
    expect(game.cumulativeScores.P4).toBe(1000);

    // Winner has the strictly highest cumulative score among all players.
    for (const p of PLAYERS) {
      if (p !== winner) expect(game.cumulativeScores[winner!]).toBeGreaterThan(game.cumulativeScores[p]);
    }

    // Dealer rotated clockwise across rounds exactly per Section 6's example:
    // Round1->P1, Round2->P2, Round3->P3, Round4->P4.
    expect(dealerSequenceSeen).toEqual(['P1', 'P2', 'P3', 'P4']);

    // Round-by-round cumulative math sanity check.
    expect(game.roundHistory.length).toBe(4);
    expect(game.roundHistory.map((r) => r.cumulativeScores.P4)).toEqual([250, 500, 750, 1000]);
    expect(game.roundHistory.map((r) => r.cumulativeScores.P1)).toEqual([110, 220, 330, 440]);

    // No hidden-card leakage: each round's public history never exposes
    // cards belonging to a set index that player didn't win, beyond what
    // was legitimately revealed at reveal time (all playedSets ARE public
    // once played, by design - this checks no EXTRA/unplayed hand data
    // leaked into history).
    for (const round of game.roundHistory) {
      for (const sr of round.subRounds) {
        expect(sr.playedSets.length).toBe(4);
      }
    }
  });

  it('never awards points before all four sets in a sub-round are played', () => {
    const game = new HaazariGame('HZR999', PLAYERS, 'P1');
    const seating = seatingOrderFromDealer(PLAYERS, game.dealerId);
    game.dealNewRound(buildDeckForSeating(seating));
    for (const p of PLAYERS) game.confirmArrangement(p, ARRANGED_SETS[p]);

    const order = game.getCurrentPlayOrder();
    game.playSet(order[0]);
    game.playSet(order[1]);
    game.playSet(order[2]);
    // Only 3 of 4 played - cumulative scores must still be zero, state still PLAYING_SET_1.
    expect(game.state).toBe('PLAYING_SET_1');
    for (const p of PLAYERS) expect(game.cumulativeScores[p]).toBe(0);

    game.playSet(order[3]);
    // Now Set 1 resolves.
    expect(game.state).toBe('PLAYING_SET_2');
  });
});
