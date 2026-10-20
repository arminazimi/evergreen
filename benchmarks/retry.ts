/** Runs `operation`, retrying failures up to `attempts` times with a growing delay; the final error names `label`. */
export async function withRetries<T>(
  label: string,
  operation: () => Promise<T>,
  options: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 2000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.error(`${label}: attempt ${attempt}/${attempts} failed, retrying.`);
        await sleep(delayMs * attempt);
      }
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label}: failed after ${attempts} attempts: ${reason}`, { cause: lastError });
}

export const DEFAULT_FETCH_TIMEOUT_SECONDS = 120;

/** Reads `EVERGREEN_CORPUS_FETCH_TIMEOUT_SECONDS`, else the default. */
export function resolveFetchTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.EVERGREEN_CORPUS_FETCH_TIMEOUT_SECONDS ?? String(DEFAULT_FETCH_TIMEOUT_SECONDS);
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Invalid EVERGREEN_CORPUS_FETCH_TIMEOUT_SECONDS "${raw}": expected a positive number.`);
  }
  return seconds * 1000;
}

/**
 * Runs `operation` with an abort signal that fires after `timeoutMs`. A stalled operation rejects with a
 * timeout error, which `withRetries` counts as a failed attempt.
 */
export async function withTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${timeoutMs / 1000} s`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
