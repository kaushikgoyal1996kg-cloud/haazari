import { io as ioClient, Socket } from 'socket.io-client';
import { autoArrange } from '../src/game/autoArrange';
import type { Card, HaazariPublicStatePayload } from '../src/game/types';

const URL = process.env.SMOKE_TEST_URL ?? 'http://localhost:3001';

/** Tracks the latest 'game:state' push and lets callers wait for a
 *  predicate to become true, without racing rapid back-to-back broadcasts
 *  (a naive one-shot .once() listener can miss events that fire before the
 *  next listener is registered). */
class StateTracker {
  latest: HaazariPublicStatePayload | null = null;
  private waiters: { predicate: (s: HaazariPublicStatePayload) => boolean; resolve: (s: HaazariPublicStatePayload) => void }[] = [];

  constructor(socket: Socket) {
    socket.on('game:state', (s: HaazariPublicStatePayload) => {
      this.latest = s;
      this.waiters = this.waiters.filter((w) => {
        if (w.predicate(s)) {
          w.resolve(s);
          return false;
        }
        return true;
      });
    });
  }

  waitUntil(predicate: (s: HaazariPublicStatePayload) => boolean): Promise<HaazariPublicStatePayload> {
    if (this.latest && predicate(this.latest)) return Promise.resolve(this.latest);
    return new Promise((resolve) => this.waiters.push({ predicate, resolve }));
  }
}

function connect(): Promise<Socket> {
  return new Promise((resolve) => {
    const s = ioClient(URL);
    s.on('connect', () => resolve(s));
  });
}
function ack<T>(socket: Socket, event: string, payload: any = {}): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, (res: T) => resolve(res)));
}
function nextHand(socket: Socket): Promise<Card[]> {
  return new Promise((resolve) => socket.once('game:yourHand', ({ hand }: { hand: Card[] }) => resolve(hand)));
}

const TERMINAL_ROUND_STATES = new Set(['ROUND_COMPLETE', 'GAME_COMPLETE', 'DISMISSED_ROUND']);

async function main() {
  console.log('=== FULL CLIENT-LOGIC END-TO-END TEST ===\n');
  console.log('Connecting 4 real clients (driven by the actual client autoArrange + handClassification modules)...');
  const sockets = await Promise.all([connect(), connect(), connect(), connect()]);
  const names = ['Alice', 'Bob', 'Carol', 'Dave'];
  const playerIds: string[] = [];

  const createRes: any = await ack(sockets[0], 'room:create', { playerName: names[0] });
  if (!createRes.ok) throw new Error('create failed: ' + createRes.error);
  playerIds[0] = createRes.playerId;
  const roomCode = createRes.roomCode;
  console.log('Room created:', roomCode);

  for (let i = 1; i < 4; i++) {
    const res: any = await ack(sockets[i], 'room:join', { roomCode, playerName: names[i] });
    if (!res.ok) throw new Error(`join failed for ${names[i]}: ${res.error}`);
    playerIds[i] = res.playerId;
  }
  console.log('All 4 players joined. Player IDs:', playerIds);

  const readyUpdates = sockets.map((s) => new Promise((resolve) => s.once('room:update', resolve)));
  for (const s of sockets) s.emit('room:ready', { ready: true });
  await Promise.all(readyUpdates);
  console.log('All 4 players ready.\n');

  const handPromises = sockets.map((s) => nextHand(s));
  sockets[0].emit('room:start');
  let hands = await Promise.all(handPromises);
  console.log('Initial deal received by all 4 players via real Socket.IO.\n');

  const tracker = new StateTracker(sockets[0]);

  let gameOver = false;
  let roundsPlayed = 0;
  const MAX_ROUNDS = 15;
  let winnerPayload: any = null;

  while (!gameOver && roundsPlayed < MAX_ROUNDS) {
    roundsPlayed++;
    console.log(`--- Round ${roundsPlayed} ---`);

    // Each client arranges its OWN hand with the real autoArrange() solver
    // and submits it exactly as the React ArrangementScreen would.
    for (let i = 0; i < 4; i++) {
      const sets = autoArrange(hands[i]);
      if (!sets) throw new Error(`autoArrange found no valid arrangement for player ${i} (hand: ${hands[i].map((c) => c.id).join(',')})`);
      const cardIdSets = sets.map((s) => s.map((c) => c.id)) as [string[], string[], string[], string[]];
      sockets[i].emit('game:confirmArrangement', { cardIdSets });
    }
    console.log('  All 4 hands arranged via real autoArrange() and confirmed.');

    // Play all 4 sub-rounds, reading whose turn it is from the server's
    // pushed state after every single play - exactly what PlayTable.tsx does.
    let state = await tracker.waitUntil((s) => s.state === 'PLAYING_SET_1' || TERMINAL_ROUND_STATES.has(s.state));

    while (!TERMINAL_ROUND_STATES.has(state.state)) {
      const order = state.currentPlayOrder ?? [];
      const nextPlayerId = order[state.playersPlayedThisSubRound.length];
      const socketIdx = playerIds.indexOf(nextPlayerId);
      if (socketIdx === -1) throw new Error(`Unknown player id in play order: ${nextPlayerId}`);
      const playedCount = state.playersPlayedThisSubRound.length;
      const setIdx = state.currentSetIndex;
      sockets[socketIdx].emit('game:playSet');
      state = await tracker.waitUntil(
        (s) =>
          TERMINAL_ROUND_STATES.has(s.state) ||
          s.currentSetIndex !== setIdx ||
          s.playersPlayedThisSubRound.length !== playedCount
      );
    }

    console.log(`  Round resolved -> ${state.state}. Cumulative scores:`, state.cumulativeScores);

    if (state.state === 'GAME_COMPLETE') {
      gameOver = true;
      winnerPayload = await new Promise((resolve) => sockets[0].once('game:over', resolve));
      break;
    }

    const nextHandPromises = sockets.map((s) => nextHand(s));
    sockets[0].emit('game:startNextRound');
    hands = await Promise.all(nextHandPromises);
  }

  if (!gameOver) throw new Error(`Game did not reach GAME_COMPLETE within ${MAX_ROUNDS} rounds`);

  console.log('\n✅ FULL END-TO-END TEST PASSED');
  console.log('Winner:', winnerPayload.winnerId, '| Final scores:', winnerPayload.finalScores);
  console.log('Rounds played:', roundsPlayed);

  const scores = winnerPayload.finalScores as Record<string, number>;
  if (scores[winnerPayload.winnerId] < 1000) throw new Error('Winner score below 1000!');
  for (const pid of playerIds) {
    if (pid !== winnerPayload.winnerId && scores[pid] >= scores[winnerPayload.winnerId]) {
      throw new Error(`Non-winner ${pid} has a score >= the winner's!`);
    }
  }
  console.log('Winner has strictly highest score and reached 1000+. \u2713');

  for (const s of sockets) s.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ FULL END-TO-END TEST FAILED:', err);
  process.exit(1);
});
