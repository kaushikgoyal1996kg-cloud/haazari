import { io as ioClient, Socket } from 'socket.io-client';

const URL = process.env.SMOKE_TEST_URL ?? 'http://localhost:3001';

function connect(): Promise<Socket> {
  return new Promise((resolve) => {
    const s = ioClient(URL);
    s.on('connect', () => resolve(s));
  });
}
function ack<T>(socket: Socket, event: string, payload: any = {}): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, (res: T) => resolve(res)));
}

async function main() {
  console.log('=== AVATAR + TABLES BROWSER TEST ===\n');
  const [alice, bob, carol] = await Promise.all([connect(), connect(), connect()]);

  // 1. Create a room with a specific avatar.
  const createRes: any = await ack(alice, 'room:create', { playerName: 'Alice', avatar: '🐘' });
  if (!createRes.ok) throw new Error('create failed: ' + createRes.error);
  console.log('Alice created room', createRes.roomCode, 'with avatar 🐘');
  const aliceInRoom = createRes.room.players.find((p: any) => p.playerId === createRes.playerId);
  if (aliceInRoom.avatar !== '🐘') throw new Error(`Expected avatar 🐘, got ${aliceInRoom.avatar}`);
  console.log('  ✓ Avatar correctly stored and echoed back in room info.');

  // 2. Invalid avatar should silently fall back to default, never crash.
  const bobRes: any = await ack(bob, 'room:join', { roomCode: createRes.roomCode, playerName: 'Bob', avatar: '<script>bad</script>' });
  if (!bobRes.ok) throw new Error('bob join failed: ' + bobRes.error);
  const bobInRoom = bobRes.room.players.find((p: any) => p.playerId === bobRes.playerId);
  console.log('  Bob joined with an invalid avatar payload, server assigned:', bobInRoom.avatar);
  if (bobInRoom.avatar === '<script>bad</script>') throw new Error('Server accepted an invalid avatar! Security issue.');
  console.log('  ✓ Invalid avatar rejected server-side, safe default used instead.');

  // 3. Browse Tables should show Alice's room as open (2/4 players).
  const tablesRes: any = await new Promise((resolve) => carol.emit('room:listTables', resolve));
  if (!tablesRes.ok) throw new Error('listTables failed: ' + tablesRes.error);
  const found = tablesRes.tables.find((t: any) => t.roomCode === createRes.roomCode);
  if (!found) throw new Error('Open table not found in browse list!');
  console.log('  ✓ Table appears in Browse Tables list:', found);
  if (found.playerCount !== 2) throw new Error(`Expected playerCount 2, got ${found.playerCount}`);
  if (found.hostName !== 'Alice') throw new Error(`Expected host Alice, got ${found.hostName}`);

  // 4. Carol joins directly via the table browser's "Join" action.
  const carolRes: any = await ack(carol, 'room:join', { roomCode: found.roomCode, playerName: 'Carol', avatar: '🦁' });
  if (!carolRes.ok) throw new Error('carol join via browse failed: ' + carolRes.error);
  console.log('  ✓ Carol joined directly from the tables browser.');

  // 5. Once a 4th joins and the room is full, it must disappear from the browse list.
  const dave = await connect();
  await ack(dave, 'room:join', { roomCode: found.roomCode, playerName: 'Dave', avatar: '🦜' });
  const tablesAfterFull: any = await new Promise((resolve) => carol.emit('room:listTables', resolve));
  const stillThere = tablesAfterFull.tables.find((t: any) => t.roomCode === found.roomCode);
  if (stillThere) throw new Error('Full table should NOT appear in the browse list anymore!');
  console.log('  ✓ Table correctly disappeared from Browse Tables once full.');

  console.log('\n✅ AVATAR + TABLES BROWSER TEST PASSED');
  for (const s of [alice, bob, carol, dave]) s.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
