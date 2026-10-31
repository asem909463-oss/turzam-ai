import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'turzam.review-state.v1';
const SUCCESS_THRESHOLD = 5;
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

type ReviewState = {
  successes: number;
  nextPromptAt: number;
  snoozedUntil: number;
  dismissed: boolean;
};

const INITIAL: ReviewState = { successes: 0, nextPromptAt: SUCCESS_THRESHOLD, snoozedUntil: 0, dismissed: false };

async function readState(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as Partial<ReviewState>;
    return {
      successes: Number.isFinite(parsed.successes) ? Math.max(0, Number(parsed.successes)) : 0,
      nextPromptAt: Number.isFinite(parsed.nextPromptAt) ? Math.max(SUCCESS_THRESHOLD, Number(parsed.nextPromptAt)) : SUCCESS_THRESHOLD,
      snoozedUntil: Number.isFinite(parsed.snoozedUntil) ? Math.max(0, Number(parsed.snoozedUntil)) : 0,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return INITIAL;
  }
}

async function writeState(state: ReviewState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Rating prompts are optional; storage failures must never affect chat.
  }
}

/** Counts completed answers and returns true only when the user is eligible for a gentle prompt. */
export async function recordSuccessfulAnswer(): Promise<boolean> {
  const state = await readState();
  state.successes += 1;
  await writeState(state);
  return !state.dismissed && state.successes >= state.nextPromptAt && Date.now() >= state.snoozedUntil;
}

export async function snoozeReviewPrompt(): Promise<void> {
  const state = await readState();
  state.snoozedUntil = Date.now() + SNOOZE_MS;
  state.nextPromptAt = state.successes + SUCCESS_THRESHOLD;
  await writeState(state);
}

export async function dismissReviewPrompt(): Promise<void> {
  const state = await readState();
  state.dismissed = true;
  await writeState(state);
}
