import type { HaazariSocket } from './socket';

/**
 * ICE server config: Google's free public STUN servers (NAT discovery,
 * works for most direct connections) plus a TURN relay fallback (for
 * networks where a direct connection can't be established - common on
 * some mobile carriers and stricter networks). The TURN credentials come
 * from a free Open Relay Project / Metered.ca account and are injected at
 * build time via Vite env vars - see .env.example. Voice calling degrades
 * gracefully to STUN-only if no TURN credentials are configured (some
 * players on restrictive networks just won't be able to connect, but it
 * won't break for everyone else).
 */
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
  ];
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
  if (turnUsername && turnCredential) {
    servers.push(
      { urls: 'turn:standard.relay.metered.ca:80', username: turnUsername, credential: turnCredential },
      { urls: 'turn:standard.relay.metered.ca:80?transport=tcp', username: turnUsername, credential: turnCredential },
      { urls: 'turn:standard.relay.metered.ca:443', username: turnUsername, credential: turnCredential },
      {
        urls: 'turns:standard.relay.metered.ca:443?transport=tcp',
        username: turnUsername,
        credential: turnCredential,
      }
    );
  }
  return servers;
}

export function isVoiceCallSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

interface PeerEntry {
  connection: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  analyser: AnalyserNode | null;
}

export interface VoiceCallCallbacks {
  onParticipantsChanged: (playerIds: string[]) => void;
  onSpeakingChanged: (playerId: string, speaking: boolean) => void;
  onError: (message: string) => void;
}

/**
 * Manages the local mic + a mesh of RTCPeerConnections, one per other
 * participant. Small group sizes (up to 4 players, so up to 3 simultaneous
 * connections per person) work fine as a pure mesh without needing a
 * media-routing server (an SFU) - the server here only ever relays small
 * signaling messages, never audio itself.
 */
export class VoiceCallManager {
  private socket: HaazariSocket;
  private myPlayerId: string;
  private localStream: MediaStream | null = null;
  private peers = new Map<string, PeerEntry>();
  private muted = false;
  private audioCtx: AudioContext | null = null;
  private speakingCheckTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: VoiceCallCallbacks;
  private joined = false;

  constructor(socket: HaazariSocket, myPlayerId: string, callbacks: VoiceCallCallbacks) {
    this.socket = socket;
    this.myPlayerId = myPlayerId;
    this.callbacks = callbacks;
  }

  get isJoined(): boolean {
    return this.joined;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get participantIds(): string[] {
    return [...this.peers.keys()];
  }

  async join(): Promise<void> {
    if (this.joined) return;
    if (!isVoiceCallSupported()) {
      this.callbacks.onError('Voice calling is not supported in this browser.');
      return;
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.callbacks.onError('Could not access your microphone. Check your browser permission and try again.');
      return;
    }

    this.socket.on('voice:participants', this.handleParticipants);
    this.socket.on('voice:peerJoined', this.handlePeerJoined);
    this.socket.on('voice:peerLeft', this.handlePeerLeft);
    this.socket.on('voice:signal', this.handleSignal);

    this.joined = true;
    this.socket.emit('voice:join');
  }

  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    this.socket.emit('voice:leave');
    this.socket.off('voice:participants', this.handleParticipants);
    this.socket.off('voice:peerJoined', this.handlePeerJoined);
    this.socket.off('voice:peerLeft', this.handlePeerLeft);
    this.socket.off('voice:signal', this.handleSignal);

    for (const id of [...this.peers.keys()]) this.teardownPeer(id);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    if (this.speakingCheckTimer) clearInterval(this.speakingCheckTimer);
    this.speakingCheckTimer = null;
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.callbacks.onParticipantsChanged([]);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    if (this.joined) this.socket.emit('voice:mute', { muted });
  }

  private handleParticipants = ({ playerIds }: { playerIds: string[] }) => {
    this.callbacks.onParticipantsChanged([...this.peers.keys(), ...playerIds]);
  };

  private handlePeerJoined = async ({ playerId }: { playerId: string }) => {
    if (playerId === this.myPlayerId || this.peers.has(playerId)) return;
    const conn = this.createPeerConnection(playerId);
    try {
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      this.socket.emit('voice:signal', { toPlayerId: playerId, data: { type: 'offer', sdp: offer.sdp } });
    } catch {
      this.callbacks.onError('Could not connect to another player in the call.');
    }
  };

  private handlePeerLeft = ({ playerId }: { playerId: string }) => {
    this.teardownPeer(playerId);
    this.callbacks.onParticipantsChanged([...this.peers.keys()]);
  };

  private handleSignal = async ({ fromPlayerId, data }: { fromPlayerId: string; data: any }) => {
    let entry = this.peers.get(fromPlayerId);
    if (!entry) {
      entry = { connection: this.createPeerConnection(fromPlayerId), audioEl: new Audio(), analyser: null };
    }
    const conn = entry.connection;

    try {
      if (data.type === 'offer') {
        await conn.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        this.socket.emit('voice:signal', { toPlayerId: fromPlayerId, data: { type: 'answer', sdp: answer.sdp } });
      } else if (data.type === 'answer') {
        await conn.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      } else if (data.type === 'ice-candidate' && data.candidate) {
        await conn.addIceCandidate(data.candidate).catch(() => {});
      }
    } catch {
      this.callbacks.onError('A connection problem occurred with another player in the call.');
    }
  };

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const conn = new RTCPeerConnection({ iceServers: buildIceServers() });
    const audioEl = new Audio();
    audioEl.autoplay = true;
    this.peers.set(peerId, { connection: conn, audioEl, analyser: null });

    this.localStream?.getTracks().forEach((track) => conn.addTrack(track, this.localStream!));

    conn.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit('voice:signal', {
          toPlayerId: peerId,
          data: { type: 'ice-candidate', candidate: e.candidate.toJSON() },
        });
      }
    };

    conn.ontrack = (e) => {
      const [stream] = e.streams;
      const entry = this.peers.get(peerId);
      if (!entry) return;
      entry.audioEl.srcObject = stream;
      entry.audioEl.play().catch(() => {});
      this.setupSpeakingDetection(peerId, stream);
      this.callbacks.onParticipantsChanged([...this.peers.keys()]);
    };

    conn.onconnectionstatechange = () => {
      if (conn.connectionState === 'failed' || conn.connectionState === 'closed') {
        this.teardownPeer(peerId);
        this.callbacks.onParticipantsChanged([...this.peers.keys()]);
      }
    };

    return conn;
  }

  private setupSpeakingDetection(peerId: string, stream: MediaStream): void {
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const entry = this.peers.get(peerId);
      if (entry) entry.analyser = analyser;

      if (!this.speakingCheckTimer) {
        const data = new Uint8Array(128);
        this.speakingCheckTimer = setInterval(() => {
          for (const [id, e] of this.peers) {
            if (!e.analyser) continue;
            e.analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            this.callbacks.onSpeakingChanged(id, avg > 12);
          }
        }, 300);
      }
    } catch {
      // Speaking-level detection is a nice-to-have - failing silently here
      // still leaves the actual audio connection working fine.
    }
  }

  private teardownPeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.connection.close();
    entry.audioEl.srcObject = null;
    this.peers.delete(peerId);
  }
}
