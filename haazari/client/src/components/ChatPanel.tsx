import { useEffect, useRef, useState } from 'react';
import { useGame } from '../lib/GameStore';
import { VoiceRecorder, isVoiceRecordingSupported, MAX_VOICE_DURATION_SEC } from '../lib/voiceRecorder';
import './ChatPanel.css';

const QUICK_REACTIONS = ['👍', '😂', '🔥', '👏', '😮', '😢', '🎉', '🤔'];

export function ChatPanel() {
  const { room, myPlayerId, chatMessages, unreadChatCount, markChatRead, sendChat } = useGame();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
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
      <button className="chat-toggle" onClick={() => setOpen((o) => !o)} aria-label="Toggle chat">
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
              <div className="text-muted chat-panel__empty">No messages yet — say hello!</div>
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
              <button key={emoji} className="chat-reaction-btn" onClick={() => sendChat(emoji, 'emoji')}>
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
              <button
                className={`chat-panel__mic ${recording ? 'chat-panel__mic--active' : ''}`}
                onPointerDown={startRecording}
                onPointerUp={() => finishRecording(true)}
                onPointerLeave={() => recording && finishRecording(false)}
                aria-label="Hold to record a voice note"
              >
                {recording ? `${recordSeconds}s 🔴` : '🎤'}
              </button>
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
        </div>
      )}
    </>
  );
}
