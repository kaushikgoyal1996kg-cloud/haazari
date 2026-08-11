export const MAX_VOICE_DURATION_SEC = 10;

export interface VoiceRecording {
  dataUrl: string;
  durationSec: number;
}

export function isVoiceRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

/**
 * One-off microphone permission request, separate from actually recording.
 * Immediately releases the stream after the browser grants/denies access.
 * Used to request permission via a plain TAP, deliberately kept apart from
 * the hold-to-record gesture - see the note on VoiceRecorder.start() below
 * for why combining them is broken.
 */
export async function requestMicPermission(): Promise<boolean> {
  if (!isVoiceRecordingSupported()) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks CURRENT microphone permission status without prompting, where the
 * browser supports it (Chrome/Edge; Firefox and Safari have limited/no
 * support for querying microphone permission state, so this returns
 * 'unknown' there rather than guessing).
 */
export async function getMicPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state as 'granted' | 'denied' | 'prompt';
  } catch {
    return 'unknown';
  }
}

/**
 * A single-use recorder: call start(), then stop() to get back the
 * recording. Automatically stops itself at MAX_VOICE_DURATION_SEC so a
 * held-down mic button can't produce an oversized payload.
 *
 * IMPORTANT: start() should only be called when microphone permission has
 * ALREADY been granted (see requestMicPermission() / the ChatPanel's
 * separate "enable microphone" tap step). Calling start() for the very
 * first time from inside a hold-to-record gesture is broken: the browser's
 * OWN permission popup requires the user to lift their finger off the
 * record button to tap "Allow," which fires a pointerup/pointerleave and
 * cancels the hold before getUserMedia() even resolves - silently
 * "swallowing" the very first attempt with no visible feedback. Requesting
 * permission as its own explicit tap first avoids this entirely (and the
 * browser then remembers the grant, so every later getUserMedia() call
 * during an actual hold resolves near-instantly with no popup at all).
 */
export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private abortedBeforeReady = false;

  async start(): Promise<void> {
    if (!isVoiceRecordingSupported()) {
      throw new Error('Voice recording is not supported in this browser.');
    }
    let stream: MediaStream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    if (this.abortedBeforeReady) {
      // cancel() was called while getUserMedia() was still pending (e.g. the
      // hold gesture ended before permission resolved) - don't leave the mic
      // active for a recording nobody is listening for anymore.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    this.stream = stream;
    const mimeType = pickSupportedMimeType();
    this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
    this.startedAt = Date.now();

    // Safety auto-stop - the UI should also stop on its own timer, but this
    // guarantees we never exceed the cap even if the UI timer is delayed.
    this.autoStopTimer = setTimeout(() => {
      if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
    }, MAX_VOICE_DURATION_SEC * 1000 + 200);
  }

  /** Stops recording and resolves with the encoded clip. Cleans up the mic stream either way. */
  stop(): Promise<VoiceRecording> {
    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        reject(new Error('Recording was never started.'));
        return;
      }
      recorder.onstop = async () => {
        if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
        this.releaseStream();
        const durationSec = Math.min((Date.now() - this.startedAt) / 1000, MAX_VOICE_DURATION_SEC);
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        try {
          const dataUrl = await blobToDataUrl(blob);
          resolve({ dataUrl, durationSec });
        } catch (err) {
          reject(err);
        }
      };
      if (recorder.state === 'recording') {
        recorder.stop();
      } else {
        reject(new Error('Recorder is not currently recording.'));
      }
    });
  }

  /** Aborts recording without producing a result (e.g. user cancels mid-hold). */
  cancel(): void {
    this.abortedBeforeReady = true; // in case start()'s getUserMedia() is still pending
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.releaseStream();
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

function pickSupportedMimeType(): string | null {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
