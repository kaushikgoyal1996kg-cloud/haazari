# Haazari

A real-time, 4-player, server-authoritative multiplayer card game.

## Status

**Stages 1–2 (game engine, rooms + Socket.IO transport) and Stage 9 (client UI)
are complete and tested end-to-end**, including a real playable game driven
through actual Socket.IO connections from client to server. Not yet built:
dedicated sound effects and a few polish items (see "What's left" below).

## Quick start

Run the server:
```bash
cd server
npm install
npm run build
npm run start        # or `npm run dev` for hot-reload
```

Run the client (separate terminal):
```bash
cd client
npm install
npm run dev           # opens on http://localhost:5173
```

Open `http://localhost:5173` in up to 4 browser tabs/devices (pointed at the
same server) to play a real 4-player game. Set `VITE_SERVER_URL` if the
server isn't on `localhost:3001`.

## Playing on a phone (same WiFi)

Your computer's `localhost` only means "this device" — a phone needs your
computer's actual network address instead. Both dev servers are already
configured to listen on all network interfaces, so this just needs your
computer's LAN IP.

**1. Find your computer's LAN IP:**
- Mac: `ipconfig getifaddr en0` (or System Settings → Wi-Fi → Details)
- Windows: `ipconfig` → look for "IPv4 Address" under your WiFi adapter
- Linux: `hostname -I`

You'll get something like `192.168.1.23`.

**2. Point the client at your server using that IP:**
```bash
cd client
cp .env.local.example .env.local
```
Edit `.env.local` and set:
```
VITE_SERVER_URL=http://192.168.1.23:3001
```
(use your actual IP from step 1)

**3. Start both servers:**
```bash
# terminal 1
cd server && npm run build && npm run start

# terminal 2
cd client && npm run dev
```
Vite will print a "Network:" URL like `http://192.168.1.23:5173` — that's
what you'll open on the phone.

**4. On your phone**, connect to the **same WiFi network** as your computer,
then open that Network URL in the browser. Repeat on up to 4 devices (or mix
phones and laptop tabs) to play a real 4-player game.

If it doesn't load: check your computer's firewall isn't blocking incoming
connections on ports 3001/5173, and double check the phone is on the same
WiFi (not cellular data, and not a "guest" network that isolates devices
from each other — some routers block device-to-device traffic on guest WiFi).

### Run the tests

```bash
cd server && npm test              # 92 unit/integration tests for the game engine
```

### Run the real-network smoke tests

Socket-level smoke test (room lifecycle + private hand delivery):
```bash
cd server && npm run start          # terminal 1
cd server && npm run smoke-test     # terminal 2
```

**Full game simulation using the actual client UI logic** (drives a complete
game — dealing, real `autoArrange()` arrangement, all sub-rounds, dismissal
eligibility, scoring, dealer rotation — through the real server over real
Socket.IO connections, using the exact same code the React app calls):
```bash
cd server && npm run start          # terminal 1
cd client && npm run full-flow-test # terminal 2
```
This has been run repeatedly against fresh random deals and reliably plays
a complete game to a valid 1000+ winner in 7–11 rounds.

## Deploying

**Server**: standard Node.js + Socket.IO app (`server/`) — deploy to Render,
Railway, Fly.io, a VPS, or anywhere else that runs Node. Set `CORS_ORIGIN`
to your client's deployed origin. `GAME_RULES.TEST_MODE` is hard-blocked
from being `true` when `NODE_ENV=production`.

**Client**: standard Vite/React static build (`client/`) — `npm run build`
produces `client/dist/`, deployable to any static host (Vercel, Netlify,
Cloudflare Pages, or served by the same box as the API). Set
`VITE_SERVER_URL` at build time to point at your deployed server.

## Architecture

```
haazari/
  server/
    src/
      game/            <- pure, framework-free game engine (fully unit tested)
        types.ts         - core types
        rules.ts         - GAME_RULES config (single source of truth - see below)
        deck.ts           - deck creation, secure shuffle, clockwise dealing
        hands.ts           - Teen Patti 3-card classification/comparison, dismissal checks
        fourCardRanking.ts  - 4-card set ranking (see "4-card ranking" below)
        arrangement.ts        - 13-card arrangement validation + auto-arrange solver
        turnOrder.ts            - play order, leader progression, dealer rotation, tie-breaking
        dismissal.ts              - voluntary whole-round dismissal
        scoring.ts                 - round scoring, 360-pt invariant, 1000+ win check
        gameEngine.ts                - the orchestrating state machine (HaazariGame class)
      rooms/            <- room/lobby lifecycle, reconnection tokens
      websocket/        <- Socket.IO event contract + handlers
      server.ts         <- Express + Socket.IO bootstrap
    tests/              <- 92 tests, including a full 4-round game simulation
    scripts/smoke-test.mts <- real-network room/dealing proof

  client/
    src/
      game/              <- mirrors server rules for instant UI feedback
        handClassification.ts  - hand ranking (kept in exact sync with server)
        autoArrange.ts           - fast optimal-search "Suggest Arrangement" solver
      components/
        Lobby/              - Landing (create/join) + RoomLobby (ready/host/start)
        Arrangement/         - tap-to-place hand arrangement screen
        Play/                  - card table, round summary, winner screen
        Card.tsx, PeacockMotif.tsx, RulesModal.tsx
      lib/
        socket.ts             - typed Socket.IO client
        GameStore.tsx          - React context: connection state, session persistence, all game actions
      styles/               - design tokens (felt/gold theme) + global styles
    scripts/full-flow-test.mts <- full real-game proof using the actual client logic
```

The server is authoritative for everything: deck, shuffle, deal, hand
validation, turn order, hand ranking, tie-breaking, scoring, dealer
rotation, round transitions, and the win condition. Clients only ever send
*intent* (confirm this arrangement, play my current set, request dismissal)
and the server validates every action against its own held state before
applying it — a client's claims about its own hand or eligibility are never
trusted (see `socketHandlers.ts`'s use of `game.getPlayerHand()` to resolve
card IDs server-side rather than accepting card data from the client).

The client duplicates the hand-ranking logic (`handClassification.ts`) for
*instant* UI feedback (the real-time validation checkmarks, labels, and the
auto-arrange button) — this is deliberate for responsiveness, not a security
boundary. The server re-validates every submission from scratch regardless;
worst case if the two ever drift is a momentarily wrong UI hint, never an
accepted-but-invalid hand.

## Rules that were clarified/assumed during development

The original spec flagged several traditional Haazari rules as needing
clarification. Here's what was decided, and where it lives in code
(`server/src/game/rules.ts` has the same documentation inline as the single
source of truth):

1. **Dismissal is voluntary, not automatic.** A player becomes *eligible*
   to dismiss when their hand meets condition 1 (no sequence) or condition
   2 (six pairs), but nothing forces it — they can play on instead.
   (`dismissal.ts`)
2. **Dismissal voids the round for all 4 players, not just the dismisser.**
   Nobody can fold mid-round — every player always plays every set in a
   round that isn't dismissed. When dismissal IS invoked, every player
   scores exactly 0 for that round, and the dealer still rotates clockwise
   before the next dealer deals a fresh round.
3. **Four-card set ranking:** the 4-card set's strength is the *best 3-card
   Teen Patti combination found among any 3 of its 4 cards* (same hierarchy
   as the other sets: Trail > Pure Sequence > Sequence > Color > Pair >
   High Card), with the leftover 4th card used purely as a kicker to break
   ties. This puts Set 4 on the exact same comparison scale as Sets 1–3, so
   the "strongest to weakest" arrangement check also requires Set 4 to rank
   below Set 3, not just be positioned last. (`fourCardRanking.ts`)
4. **"No sequence" dismissal condition:** a hand qualifies if none of its
   four sets (three 3-card sets, plus the 4-card set's best 3-of-4 sub-combo)
   contains a Sequence, Pure Sequence, or Trail.
5. **"Six pairs" dismissal condition:** the raw 13-card hand contains 6 or
   more distinct-rank pairs (a rank held 3–4 times still only counts
   `floor(count/2)` pairs).
6. **Starting leader for Set 1 of a fresh round:** the player seated
   immediately clockwise of the dealer (`LEFT_OF_DEALER`), not the dealer
   themselves. Configurable via `GAME_RULES.STARTING_PLAYER_RULE`.
7. **Tie-breaking is always by last-throw order, never suit** — this was
   explicit in the original spec and is enforced with dedicated tests that
   would fail if a suit-based tiebreak were accidentally introduced.

All of the above are centralized in `GAME_RULES` (`rules.ts`) specifically
so they can be changed in one place without touching the rest of the
engine, per the original spec's requirement not to scatter assumptions
through the code.

## What's left to build

- **Sound effects** (Section 47) — deal/select/play/reveal/winner/round-complete
  cues with an on/off toggle. Not yet implemented.
- **Card dealing animation** — cards currently appear once dealt rather than
  animating from the deck; the server does expose full deal-sequence data
  (`dealCards()` returns an ordered `dealSequence`) that a future animation
  could consume, it's just not wired to the UI yet.
- **"Play Again" from the winner screen** — currently only "Return to Lobby"
  is wired; playing again with the same 4 players would need a small
  room-reset endpoint.
- Additional reconnection-under-load and multi-room-scale testing.
- Optional: back the in-memory `RoomManager` with shared storage (Redis,
  etc.) if you need multiple server instances behind a load balancer.
