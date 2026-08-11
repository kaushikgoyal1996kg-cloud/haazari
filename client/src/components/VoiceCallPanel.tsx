import { useState } from 'react';
import { useGame } from '../lib/GameStore';
import './VoiceCallPanel.css';

export function VoiceCallPanel() {
  const {
    room,
    myPlayerId,
    voiceCallSupported,
    inVoiceCall,
    voiceMuted,
    voiceParticipants,
    speakingPlayerIds,
    joinVoiceCall,
    leaveVoiceCall,
    toggleVoiceMute,
  } = useGame();
  const [open, setOpen] = useState(false);

  if (!room || !voiceCallSupported) return null;

  function nameOf(playerId: string) {
    return room!.players.find((p) => p.playerId === playerId)?.name ?? playerId;
  }

  const othersInCall = voiceParticipants.filter((id) => id !== myPlayerId);

  return (
    <>
      <button
        className={`voice-call-toggle fab ${inVoiceCall ? 'voice-call-toggle--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Voice call"
      >
        {inVoiceCall ? '📞' : '☎️'}
        {inVoiceCall && othersInCall.length > 0 && (
          <span className="voice-call-toggle__badge">{othersInCall.length}</span>
        )}
      </button>

      {open && (
        <div className="voice-call-panel panel">
          <div className="voice-call-panel__header">
            <span>Voice Call</span>
            <button className="btn btn-ghost voice-call-panel__close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>

          {!inVoiceCall ? (
            <button className="btn btn-primary voice-call-panel__join" onClick={joinVoiceCall}>
              📞 Join Voice Call
            </button>
          ) : (
            <>
              <div className="voice-call-panel__actions">
                <button className="btn btn-ghost" onClick={toggleVoiceMute}>
                  {voiceMuted ? '🔇 Unmute' : '🎙️ Mute'}
                </button>
                <button className="btn voice-call-panel__leave" onClick={leaveVoiceCall}>
                  Leave Call
                </button>
              </div>

              <div className="voice-call-panel__participants">
                <div className="voice-call-panel__you">
                  <span className={`voice-call-dot ${voiceMuted ? 'voice-call-dot--muted' : 'voice-call-dot--live'}`} />
                  You {voiceMuted && '(muted)'}
                </div>
                {othersInCall.length === 0 && (
                  <p className="text-muted voice-call-panel__empty">Waiting for others to join…</p>
                )}
                {othersInCall.map((id) => (
                  <div key={id} className="voice-call-panel__participant">
                    <span
                      className={`voice-call-dot ${speakingPlayerIds.includes(id) ? 'voice-call-dot--speaking' : 'voice-call-dot--live'}`}
                    />
                    {nameOf(id)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
