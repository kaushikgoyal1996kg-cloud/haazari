import { useEffect, useRef, useState } from 'react';
import { useGame } from '../lib/GameStore';
import {
  VoiceRecorder,
  isVoiceRecordingSupported,
  requestMicPermission,
  getMicPermissionState,
  MAX_VOICE_DURATION_SEC,
} from '../lib/voiceRecorder';
import './ChatPanel.css';

const QUICK_REACTIONS = ['👍', '😂', '🔥', '👏', '😮', '😢', '🎉', '🤔'];

export function ChatPanel() {
  const { room, myPlayerId, chatMessages, unreadChatCount, markChatRead, sendChat } = useGame();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied' | 'checking'>('unknown');
  const listRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceSupported = isVoiceRecordingSupported();

  useEffect(() => {
    if (open) markChatRead();
  }, [open, chatMessages.length, markChatRead]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chatMessages, open]);

  // Check (without prompting) whether mic permission was already granted in
  // an earlier session, so returning players go straight to hold-to-record
  // instead of seeing the "enable" step again every time.
  useEffect(() => {
    if (!voiceSupported) return;
    getMicPermissionState().then((state) => {
      if (state === 'granted') setMicPermission('granted');
      else if (state === 'denied') setMicPermission('denied');
      // 'prompt'/'unknown' -> leave as 'unknown', show the enable step.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety: if the panel closes or unmounts mid-recording, don't leave the mic open.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!room) return null;

  function nameOf(playerId: string) {
    return room!.players.find((p) => p.playerId === playerId)?.name ?? playerId;
  }

  function handleSend() {
    if (!text.trim()) return;
    sendChat(text, 'text');
    setText('');
  }

  /**
   * Deliberately a plain TAP, not part of the hold-to-record gesture. The
   * browser's own "Allow microphone?" popup requires lifting your finger to
   * tap "Allow," which would cancel a hold-to-record gesture mid-flight -
   * so permission is requested here, once, up front, and the actual
   * hold-to-record button only appears afterward, once permission is
   * already settled (so every real recording's getUserMedia() call
   * resolves instantly with no popup to interrupt it).
   */
  async function handleEnableMic() {
    setMicPermission('checking');
    setVoiceError(null);
    const granted = await requestMicPermission();
    setMicPermission(granted ? 'granted' : 'denied');
    if (!granted) {
      setVoiceError('Microphone access was denied. Check your browser/site settings to allow it, then try again.');
    }
  }

  async function startRecording() {
    setVoiceError(null);
    const recorder = new VoiceRecorder();
    recorderRef.current = recorder;
    try {
      await recorder.start();
    } catch {
      setVoiceError('Could not access your microphone. Check your browser permission and try again.');
      recorderRef.current = null;
      return;
    }
    setRecording(true);
    setRecordSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordSeconds((s) => Math.min(s + 1, MAX_VOICE_DURATION_SEC));
    }, 1000);
  }

  async function finishRecording(shouldSend: boolean) {
    const recorder = recorderRef.current;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    setRecordSeconds(0);
    if (!recorder) return;

    if (!shouldSend) {
      recorder.cancel();
      recorderRef.current = null;
      return;
    }
    try {
      const { dataUrl, durationSec } = await recorder.stop();
      if (durationSec < 0.4) {
        // Too short to be a real message (likely an accidental tap) - drop it silently.
      } else {
        sendChat(dataUrl, 'voice', durationSec);
      }
    } catch {
      setVoiceError('Could not send your voice note - please try again.');
    }
    recorderRef.current = null;
  }

  return (
    <>
      <button className="chat-toggle fab" onClick={() => setOpen((o) => !o)} aria-label="Toggle chat">
        💬
        {!open && unreadChatCount > 0 && (
          <span className="chat-toggle__badge">
            {Math.min(unreadChatCount, 9)}
            {unreadChatCount > 9 ? '+' : ''}
          </span>
        )}
      </button>

      {open && (
        <div className="chat-panel panel">
          <div className="chat-panel__header">
            <span>Table Chat</span>
            <button className="chat-panel__close" onClick={() => setOpen(false)} aria-label="Close chat">
              ✕
            </button>
          </div>

          <div className="chat-panel__messages" ref={listRef}>
            {chatMessages.length === 0 && (
              <div className="text-muted chat-panel__empty">
                <span className="empty-state__icon" aria-hidden="true">💬</span>
                <br />
                No messages yet — say hello!
              </div>
            )}
            {chatMessages.map((m, i) => {
              const isMe = m.playerId === myPlayerId;
              return (
                <div key={i} className={`chat-msg ${isMe ? 'chat-msg--me' : ''}`}>
                  <span className="chat-msg__avatar">{m.avatar}</span>
                  <div className="chat-msg__body">
                    <span className="chat-msg__name">{isMe ? 'You' : nameOf(m.playerId)}</span>
                    {m.kind === 'voice' ? (
                      <div className="chat-msg__voice">
                        <audio controls src={m.message} preload="metadata" />
                        {typeof m.durationSec === 'number' && (
                          <span className="chat-msg__voice-duration">{Math.round(m.durationSec)}s</span>
                        )}
                      </div>
                    ) : (
                      <span className={m.kind === 'emoji' ? 'chat-msg__emoji' : 'chat-msg__text'}>{m.message}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {voiceError && <div className="error-text chat-panel__voice-error">{voiceError}</div>}

          <div className="chat-panel__reactions">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                className="chat-reaction-btn"
                onClick={() => sendChat(emoji, 'emoji')}
                aria-label={`Send ${emoji} reaction`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="chat-panel__input-row">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              maxLength={240}
              placeholder="Type a message…"
              disabled={recording}
            />
            {voiceSupported && !text.trim() ? (
              micPermission === 'granted' ? (
                <button
                  className={`chat-panel__mic ${recording ? 'chat-panel__mic--active' : ''}`}
                  onPointerDown={startRecording}
                  onPointerUp={() => finishRecording(true)}
                  onPointerLeave={() => recording && finishRecording(false)}
                  onPointerCancel={() => recording && finishRecording(false)}
                  aria-label="Hold to record a voice note"
                >
                  {recording ? `${recordSeconds}s 🔴` : '🎤'}
                </button>
              ) : (
                <button
                  className="chat-panel__mic chat-panel__mic--enable"
                  onClick={handleEnableMic}
                  disabled={micPermission === 'checking'}
                  aria-label="Enable microphone for voice messages"
                >
                  {micPermission === 'checking' ? '…' : '🎤+'}
                </button>
              )
            ) : (
              <button className="btn btn-primary chat-panel__send" disabled={!text.trim()} onClick={handleSend}>
                Send
              </button>
            )}
          </div>
          {recording && (
            <div className="chat-panel__recording-hint text-muted">
              Recording… release to send, drag away to cancel (max {MAX_VOICE_DURATION_SEC}s)
            </div>
          )}
          {voiceSupported && micPermission === 'unknown' && !text.trim() && !recording && (
            <div className="chat-panel__recording-hint text-muted">Tap 🎤+ once to enable voice messages</div>
          )}
        </div>
      )}
    </>
  );
}
