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
