export type RetryDecision = {
  shouldRetry: boolean;
  nextRunAt: Date | null;
  nextAttempt: number;
};

export function calculateRetry(attempt: number, maxAttempts: number, now = new Date()): RetryDecision {
  const nextAttempt = attempt + 1;
  if (nextAttempt >= maxAttempts) {
    return {
      shouldRetry: false,
      nextRunAt: null,
      nextAttempt
    };
  }

  const delaySeconds = Math.min(60 * 30, 2 ** attempt);
  return {
    shouldRetry: true,
    nextRunAt: new Date(now.getTime() + delaySeconds * 1000),
    nextAttempt
  };
}
