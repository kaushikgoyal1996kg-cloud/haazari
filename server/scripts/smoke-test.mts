import { io as ioClient, Socket } from 'socket.io-client';

const URL = process.env.SMOKE_TEST_URL ?? 'http://localhost:3001';

function connect(): Promise<Socket> {
  return new Promise((resolve) => {
    const s = ioClient(URL, { transports: ['websocket'] });
    s.on('connect', () => resolve(s));
  });
}

function ack<T>(socket: Socket, event: string, payload: any): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, (res: T) => resolve(res)));
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, (payload: T) => resolve(payload)));
}

async function main() {
  console.log('Connecting 4 clients...');
  const sockets = await Promise.all([connect(), connect(), connect(), connect()]);
  console.log('All 4 connected.');

  // Player 1 creates the room.
  const createRes: any = await ack(sockets[0], 'room:create', { playerName: 'Alice' });
  if (!createRes.ok) throw new Error('room:create failed: ' + createRes.error);
  const roomCode = createRes.roomCode;
  console.log('Room created:', roomCode, 'host player id:', createRes.playerId);

  // Players 2-4 join.
  const names = ['Bob', 'Carol', 'Dave'];
  const joinResults: any[] = [];
  for (let i = 1; i < 4; i++) {
    const res: any = await ack(sockets[i], 'room:join', { roomCode, playerName: names[i - 1] });
    if (!res.ok) throw new Error(`room:join failed for ${names[i - 1]}: ${res.error}`);
    joinResults.push(res);
    console.log(`${names[i - 1]} joined as`, res.playerId);
  }

  // Room should now report 4 players, full.
  const roomUpdatePromise = waitFor<any>(sockets[0], 'room:update');

  // All 4 players mark ready.
  for (const s of sockets) s.emit('room:ready', { ready: true });

  const roomState: any = await roomUpdatePromise;
  console.log('Room has', roomState.players.length, 'players, statuses:', roomState.players.map((p: any) => p.ready));

  // Set up listeners BEFORE starting, to catch dealt hands + state.
  const handPromises = sockets.map((s) => waitFor<any>(s, 'game:yourHand'));
  const statePromises = sockets.map((s) => waitFor<any>(s, 'game:state'));

  // Host starts the game.
  sockets[0].emit('room:start');

  const hands = await Promise.all(handPromises);
  const states = await Promise.all(statePromises);

  console.log('All 4 players received their hands. Sizes:', hands.map((h) => h.hand.length));
  for (const h of hands) {
    if (h.hand.length !== 13) throw new Error(`Expected 13 cards, got ${h.hand.length}`);
  }

  // Verify no two players received overlapping cards (hidden-card / dealing integrity over the real wire).
  const idSets = hands.map((h) => new Set(h.hand.map((c: any) => c.id)));
  for (let i = 0; i < idSets.length; i++) {
    for (let j = i + 1; j < idSets.length; j++) {
      const overlap = [...idSets[i]].some((id) => idSets[j].has(id));
      if (overlap) throw new Error(`Card overlap detected between player ${i} and ${j}!`);
    }
  }
  const allIds = new Set(hands.flatMap((h) => h.hand.map((c: any) => c.id)));
  if (allIds.size !== 52) throw new Error(`Expected 52 unique cards total, got ${allIds.size}`);

  console.log('No card overlap between any players. Full 52-card deck accounted for.');
  console.log('Game states received:', states.map((s) => s.state));
  if (!states.every((s) => s.state === 'ARRANGING_HANDS')) {
    throw new Error('Expected all clients to see ARRANGING_HANDS state');
  }

  console.log('\n✅ SMOKE TEST PASSED: real Socket.IO room lifecycle + private hand delivery works end-to-end.');
  for (const s of sockets) s.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ SMOKE TEST FAILED:', err);
  process.exit(1);
});
