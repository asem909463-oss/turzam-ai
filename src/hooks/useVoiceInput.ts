import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { File } from 'expo-file-system';
import { callFunction } from '../lib/stream';
import { supabase } from '../lib/supabase';

const SPEECH_DB = -38; // louder than this counts as speech
const SILENCE_MS = 1400; // quiet this long after speech = finished talking
const MAX_MS = 60_000;

async function restoreAudioMode() {
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
}

function removeTemporaryRecording(uri: string | null | undefined) {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // The recorder may not have created the file, or the OS may already have removed it.
  }
}

/**
 * Records the microphone and turns it into text on the server (Gemini).
 * Stops by itself after the person finishes speaking, or when `stopAndTranscribe` is called.
 * Temporary recording files are removed after use and whenever the overlay is dismissed.
 */
export function useVoiceInput(opts: { lang?: string; onText: (text: string) => void; onError: (msg: string) => void }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 80);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0); // 0..1, for animation

  const heardRef = useRef(false);
  const lastLoudRef = useRef(0);
  const startedRef = useRef(0);
  const activeRef = useRef(false);
  const startAttemptRef = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const finish = useCallback(
    async (discard: boolean) => {
      // Also invalidates a permission/prepare operation that has not started recording yet.
      startAttemptRef.current += 1;
      if (!activeRef.current) {
        await restoreAudioMode();
        return;
      }
      activeRef.current = false;
      setListening(false);
      setLevel(0);
      let uri: string | null = recorder.uri;
      try {
        await recorder.stop();
        uri = recorder.uri ?? uri;
      } catch {
        // Already stopped; still clean up the last known URI below.
      }
      await restoreAudioMode();
      if (discard || !uri || !heardRef.current) {
        if (!discard) optsRef.current.onText('');
        removeTemporaryRecording(uri);
        return;
      }
      setTranscribing(true);
      try {
        const b64 = await new File(uri).base64();
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) throw new Error('Please sign in again.');
        const mime = uri.endsWith('.m4a') || uri.endsWith('.mp4') ? 'audio/mp4' : uri.endsWith('.3gp') ? 'audio/3gpp' : 'audio/mp4';
        const res = await callFunction<{ text: string }>(token, { action: 'transcribe', audio: b64, mime, lang: optsRef.current.lang }, 45_000);
        optsRef.current.onText((res.text ?? '').trim());
      } catch (e) {
        optsRef.current.onError(e instanceof Error ? e.message : 'Could not understand the recording.');
      } finally {
        setTranscribing(false);
        removeTemporaryRecording(uri);
      }
    },
    [recorder],
  );

  const start = useCallback(async () => {
    if (activeRef.current || transcribing) return;
    const attempt = ++startAttemptRef.current;
    const isCurrentAttempt = () => startAttemptRef.current === attempt;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!isCurrentAttempt()) return;
      if (!perm.granted) {
        optsRef.current.onError('Allow microphone access in your phone settings to talk to Turzam.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!isCurrentAttempt()) {
        await restoreAudioMode();
        return;
      }
      await recorder.prepareToRecordAsync();
      if (!isCurrentAttempt()) {
        removeTemporaryRecording(recorder.uri);
        await restoreAudioMode();
        return;
      }
      heardRef.current = false;
      startedRef.current = Date.now();
      lastLoudRef.current = Date.now();
      activeRef.current = true;
      recorder.record();
      setListening(true);
    } catch (e) {
      activeRef.current = false;
      removeTemporaryRecording(recorder.uri);
      await restoreAudioMode();
      if (isCurrentAttempt()) optsRef.current.onError(e instanceof Error ? e.message : 'Could not start the microphone.');
    }
  }, [recorder, transcribing]);

  // Watch the volume: animate, and auto-stop once the person has spoken and then gone quiet.
  useEffect(() => {
    if (!activeRef.current || !state.isRecording) return;
    const db = typeof state.metering === 'number' ? state.metering : -160;
    setLevel(Math.max(0, Math.min(1, (db + 60) / 50)));
    const now = Date.now();
    if (db > SPEECH_DB) {
      heardRef.current = true;
      lastLoudRef.current = now;
    }
    if (heardRef.current && now - lastLoudRef.current > SILENCE_MS) void finish(false);
    else if (now - startedRef.current > MAX_MS) void finish(false);
    else if (!heardRef.current && now - startedRef.current > 12_000) void finish(false); // nobody spoke
  }, [state, finish]);

  useEffect(
    () => () => {
      startAttemptRef.current += 1;
      if (activeRef.current) {
        activeRef.current = false;
        void (async () => {
          let uri: string | null = recorder.uri;
          try {
            await recorder.stop();
            uri = recorder.uri ?? uri;
          } catch {
            // Already stopped.
          }
          await restoreAudioMode();
          removeTemporaryRecording(uri);
        })();
      }
    },
    [recorder],
  );

  return {
    listening,
    transcribing,
    level,
    start,
    /** Stop now and send what was said. */
    stopAndTranscribe: () => finish(false),
    /** Stop and throw the recording away. */
    cancel: () => finish(true),
  };
}
