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
 * A single-use recorder: call start(), then stop() to get back the
 * recording. Automatically stops itself at MAX_VOICE_DURATION_SEC so a
 * held-down mic button can't produce an oversized payload.
 */
export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;

  async start(): Promise<void> {
    if (!isVoiceRecordingSupported()) {
      throw new Error('Voice recording is not supported in this browser.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
