import { useEffect, useState } from 'react';
import { useGame } from '../../lib/GameStore';
import { PeacockMotif } from '../PeacockMotif';
import { InstallBanner } from '../InstallBanner';
import { AvatarPicker } from './AvatarPicker';
import { TablesBrowser } from './TablesBrowser';
import { AVATAR_OPTIONS } from '../../game/avatars';
import './Lobby.css';

type Mode = 'name' | 'menu' | 'create' | 'join' | 'browse';

function codeFromShareLink(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get('join') ?? '').toUpperCase();
}

export function Landing() {
  const { createRoom, joinRoom, quickMatch, roomError } = useGame();
  const [mode, setMode] = useState<Mode>('name');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]);
  const [code, setCode] = useState(codeFromShareLink);
  const [busy, setBusy] = useState(false);
  const sharedInvite = !!code;

  // Clean the ?join=... param out of the URL once we've read it, so it
  // doesn't linger if the user later shares/bookmarks this tab themselves.
  useEffect(() => {
    if (sharedInvite && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    setBusy(true);
    await createRoom(name.trim(), avatar);
    setBusy(false);
  }

  async function handleJoin(roomCode?: string) {
    const target = (roomCode ?? code).trim();
    if (!target) return;
    setBusy(true);
    await joinRoom(target, name.trim(), avatar);
    setBusy(false);
  }

  async function handleQuickMatch() {
    setBusy(true);
    await quickMatch(name.trim(), avatar);
    setBusy(false);
  }

  return (
    <div className="landing">
      <PeacockMotif />
      <h1 className="wordmark landing__title">Haazari</h1>
      <p className="text-muted landing__tagline">A four-player card game of sets and strategy</p>
      <InstallBanner />

      {mode === 'name' && (
        <div className="landing__form panel">
          {sharedInvite && (
            <p className="landing__invite-note">
              🎉 You've been invited to room <strong>{code}</strong>!
            </p>
          )}
          <label className="landing__field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Enter your name" />
          </label>
          <div className="landing__field">
            <span>Choose an avatar</span>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => setMode(sharedInvite ? 'join' : 'menu')}
          >
            {sharedInvite ? 'Join Room' : 'Continue'}
          </button>
        </div>
      )}

      {mode === 'menu' && (
        <div className="landing__actions">
          <button className="btn btn-primary" disabled={busy} onClick={handleQuickMatch}>
            🎲 Quick Match
          </button>
          <button className="btn" disabled={busy} onClick={handleCreate}>
            Create Game
          </button>
          <button className="btn" onClick={() => setMode('join')}>Join by Code</button>
          <button className="btn" onClick={() => setMode('browse')}>Browse Tables</button>
          <button className="btn btn-ghost" onClick={() => setMode('name')}>Change name / avatar</button>
          {roomError && <div className="error-text">{roomError}</div>}
        </div>
      )}

      {mode === 'join' && (
        <div className="landing__form panel">
          <label className="landing__field">
            <span>Room code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="HZR482"
            />
          </label>
          {roomError && <div className="error-text">{roomError}</div>}
          <div className="landing__form-actions">
            <button className="btn btn-ghost" onClick={() => setMode('menu')}>Back</button>
            <button className="btn btn-primary" disabled={busy || !code.trim()} onClick={() => handleJoin()}>
              Join
            </button>
          </div>
        </div>
      )}

      {mode === 'browse' && (
        <TablesBrowser onJoin={(roomCode) => handleJoin(roomCode)} onBack={() => setMode('menu')} busy={busy} error={roomError} />
      )}
    </div>
  );
}
