const encoder = new TextEncoder();

/** Compare bounded UTF-8 values without an early-exit content comparison. */
export function constantTimeEqual(expected: string, received: string): boolean {
  if (!expected || received.length > 128) return false;
  const left = encoder.encode(expected);
  const right = encoder.encode(received);
  const count = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < count; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function validFounderAccessCode(expected: string, received: unknown): boolean {
  if (typeof received !== "string" || received.length < 1 || received.length > 128) return false;
  return constantTimeEqual(expected, received);
}

export function safePage(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return fallback;
  return Math.min(maximum, Math.max(1, value));
}

export function safeSearch(value: unknown, maxLength = 100): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
