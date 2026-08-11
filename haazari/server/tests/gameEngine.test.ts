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

function dealFixtureRound(game: HaazariGame) {
  const seating = seatingOrderFromDealer(PLAYERS, game.dealerId);
  game.dealNewRound(buildDeckForSeating(seating));
}

describe('HaazariGame construction', () => {
  it('requires exactly 4 players', () => {
    expect(() => new HaazariGame('ROOM1', ['P1', 'P2', 'P3'])).toThrow();
  });

  it('picks a dealer from the player list', () => {
    const game = new HaazariGame('ROOM1', PLAYERS);
    expect(PLAYERS).toContain(game.dealerId);
  });

  it('accepts a deterministic initial dealer (for TEST_MODE)', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P2');
    expect(game.dealerId).toBe('P2');
  });
});

describe('dealing', () => {
  it('deals exactly 52 unique cards, 13 to each of 4 players, no overlap', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    const all = PLAYERS.flatMap((p) => game.getPlayerHand(p));
    expect(all.length).toBe(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
    for (const p of PLAYERS) expect(game.getPlayerHand(p).length).toBe(13);
    expect(game.state).toBe('ARRANGING_HANDS');
  });

  it('never leaks one player hand as identical to another', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    const hands = PLAYERS.map((p) => new Set(game.getPlayerHand(p).map((c) => c.id)));
    for (let i = 0; i < hands.length; i++) {
      for (let j = i + 1; j < hands.length; j++) {
        const overlap = [...hands[i]].some((id) => hands[j].has(id));
        expect(overlap).toBe(false);
      }
    }
  });
});

describe('hand arrangement confirmation', () => {
  it('rejects an invalid arrangement (wrong split sizes)', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    const hand = game.getPlayerHand('P1');
    const badSets: [any, any, any, any] = [hand.slice(0, 2), hand.slice(2, 5), hand.slice(5, 8), hand.slice(8, 13)];
    const result = game.confirmArrangement('P1', badSets);
    expect(result.ok).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('transitions to ROUND_READY and begins Set 1 only once all 4 players confirm', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    for (const p of PLAYERS.slice(0, 3)) {
      const r = game.confirmArrangement(p, ARRANGED_SETS[p]);
      expect(r.ok).toBe(true);
      expect(game.state).toBe('WAITING_FOR_HAND_CONFIRMATION');
    }
    const r = game.confirmArrangement('P4', ARRANGED_SETS.P4);
    expect(r.ok).toBe(true);
    expect(game.state).toBe('PLAYING_SET_1');
  });
});

describe('turn enforcement during sub-round play', () => {
  function readyGame(): HaazariGame {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    for (const p of PLAYERS) game.confirmArrangement(p, ARRANGED_SETS[p]);
    return game;
  }

  it('rejects a play from someone who is not next in turn order', () => {
    const game = readyGame();
    const order = game.getCurrentPlayOrder();
    const outOfTurn = PLAYERS.find((p) => p !== order[0])!;
    expect(() => game.playSet(outOfTurn)).toThrow(/Not .*'s turn/);
  });

  it('rejects a player attempting to play twice in the same sub-round', () => {
    const game = readyGame();
    const order = game.getCurrentPlayOrder();
    game.playSet(order[0]);
    expect(() => game.playSet(order[0])).toThrow(/already played/);
  });

  it('advances leader to the winner of each set (leader progression, Section 15)', () => {
    const game = readyGame();
    let order = game.getCurrentPlayOrder();
    for (const pid of order) game.playSet(pid);
    // Set 1 winner (P1, per fixture) should now be the leader for Set 2.
    expect(game.state).toBe('PLAYING_SET_2');
    order = game.getCurrentPlayOrder();
    expect(order[0]).toBe('P1');
  });
});

describe('dismissal voids the whole round for everyone', () => {
  it('every player scores 0 and the dealer still rotates', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    const sixPairHand = [
      { rank: 'A' as const, suit: 'SPADES' as const, id: 'SPADES_A' },
      { rank: 'A' as const, suit: 'HEARTS' as const, id: 'HEARTS_A' },
      { rank: 'K' as const, suit: 'SPADES' as const, id: 'SPADES_K' },
      { rank: 'K' as const, suit: 'HEARTS' as const, id: 'HEARTS_K' },
      { rank: 'Q' as const, suit: 'SPADES' as const, id: 'SPADES_Q' },
      { rank: 'Q' as const, suit: 'HEARTS' as const, id: 'HEARTS_Q' },
      { rank: 'J' as const, suit: 'SPADES' as const, id: 'SPADES_J' },
      { rank: 'J' as const, suit: 'HEARTS' as const, id: 'HEARTS_J' },
      { rank: '10' as const, suit: 'SPADES' as const, id: 'SPADES_10' },
      { rank: '10' as const, suit: 'HEARTS' as const, id: 'HEARTS_10' },
      { rank: '9' as const, suit: 'SPADES' as const, id: 'SPADES_9' },
      { rank: '9' as const, suit: 'HEARTS' as const, id: 'HEARTS_9' },
      { rank: '8' as const, suit: 'SPADES' as const, id: 'SPADES_8' },
    ];
    // Force P2's dealt hand to a six-pair hand for this test.
    (game as any).hands['P2'] = sixPairHand;

    const dealerBefore = game.dealerId;
    const outcome = game.requestDismissal('P2', 'SIX_PAIRS');
    expect(outcome.ok).toBe(true);
    expect(game.state).toBe('DISMISSED_ROUND');
    for (const p of PLAYERS) expect(game.cumulativeScores[p]).toBe(0);
    expect(game.dealerId).not.toBe(dealerBefore);
    expect(game.roundHistory[0].dismissed).toBe(true);
    expect(game.roundHistory[0].pointsThisRound).toEqual({ P1: 0, P2: 0, P3: 0, P4: 0 });
  });

  it('rejects dismissal from an ineligible player', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    const outcome = game.requestDismissal('P1', 'SIX_PAIRS'); // P1's fixture hand is not eligible
    expect(outcome.ok).toBe(false);
  });
});

describe('getPublicState().playedSetsThisSubRound', () => {
  it('is empty before anyone has played the current sub-round', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    for (const p of PLAYERS) game.confirmArrangement(p, ARRANGED_SETS[p]);
    expect(game.getPublicState().playedSetsThisSubRound).toEqual([]);
  });

  it('reveals each played set IMMEDIATELY as that player plays it - not just after all 4 have played', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    for (const p of PLAYERS) game.confirmArrangement(p, ARRANGED_SETS[p]);
    const order = game.getCurrentPlayOrder();

    // First player plays - their set should appear right away, others still hidden.
    game.playSet(order[0]);
    let state = game.getPublicState();
    expect(state.playedSetsThisSubRound.length).toBe(1);
    expect(state.playedSetsThisSubRound[0].playerId).toBe(order[0]);
    expect(state.playedSetsThisSubRound[0].cards.length).toBe(3); // Set 1 (index 0) has 3 cards
    expect(state.playedSetsThisSubRound[0].cards).toEqual(ARRANGED_SETS[order[0]][0]);

    // Second player plays - now two are visible, the other two still aren't.
    game.playSet(order[1]);
    state = game.getPublicState();
    expect(state.playedSetsThisSubRound.length).toBe(2);
    const playedIds = state.playedSetsThisSubRound.map((p) => p.playerId);
    expect(playedIds).toContain(order[0]);
    expect(playedIds).toContain(order[1]);
    expect(playedIds).not.toContain(order[2]);
    expect(playedIds).not.toContain(order[3]);
  });

  it('resets to empty once the sub-round resolves and the next one begins', () => {
    const game = new HaazariGame('ROOM1', PLAYERS, 'P1');
    dealFixtureRound(game);
    for (const p of PLAYERS) game.confirmArrangement(p, ARRANGED_SETS[p]);
    const order = game.getCurrentPlayOrder();
    for (const pid of order) game.playSet(pid);
    // Set 1 resolved - state has moved on to Set 2, so the field should
    // reflect Set 2's (empty so far) plays, not Set 1's leftover cards.
    expect(game.getPublicState().playedSetsThisSubRound).toEqual([]);
  });
});
