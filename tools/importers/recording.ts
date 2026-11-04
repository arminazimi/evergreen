import { readFile, writeFile } from "node:fs/promises";

import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import { ImporterError } from "./types.js";
import type { FetchOptions, ImporterContext } from "./types.js";

export const RECORDING_SCHEMA = "evergreen.importer-recording.v1" as const;

export interface RecordedResponse {
  url: string;
  accept?: string;
  /** POST body when the request was not a GET; recordings key on it so two POSTs to one URL stay distinct. */
  requestBody?: string;
  /** The response body, for a successful request. */
  body?: string;
  /** The failure message, for a request that failed (for example `GET ... failed: HTTP 404`). */
  error?: string;
}

/**
 * Everything one importer run read from the outside world. Tests replay it, so they need no network
 * and see the same bytes every time.
 */
export interface Recording {
  schemaVersion: typeof RECORDING_SCHEMA;
  importer: string;
  /** The day the responses were captured. Replays use it as the run date. */
  recordedAt: string;
  /** True for a recording written by hand instead of captured from a real source. */
  synthetic?: boolean;
  responses: RecordedResponse[];
}

/** Stable lookup key. GET recordings stay `url` or `url\\naccept`; POST adds a third line for the body. */
const keyOf = (url: string, accept?: string, requestBody?: string) => {
  if (requestBody !== undefined) return `${url}\n${accept ?? ""}\n${requestBody}`;
  return accept ? `${url}\n${accept}` : url;
};

/** Wraps a context and remembers every response, including failures, so a run can be saved. */
export function recordingContext(inner: ImporterContext): {
  context: ImporterContext;
  recording(importer: string): Recording;
} {
  const responses = new Map<string, RecordedResponse>();
  return {
    context: {
      now: inner.now,
      async fetchText(url, options) {
        const key = keyOf(url, options?.accept, options?.body);
        const meta = {
          url,
          ...(options?.accept ? { accept: options.accept } : {}),
          ...(options?.body === undefined ? {} : { requestBody: options.body }),
        };
        try {
          const body = await inner.fetchText(url, options);
          responses.set(key, { ...meta, body });
          return body;
        } catch (error) {
          responses.set(key, { ...meta, error: (error as Error).message });
          throw error;
        }
      },
    },
    recording: (importer) => ({
      schemaVersion: RECORDING_SCHEMA,
      importer,
      recordedAt: isoDate(inner.now),
      responses: [...responses.values()],
    }),
  };
}

/** A context that answers only from a recording and reports recorded responses nothing asked for. */
export function replayContext(recording: Recording, now?: Date): ImporterContext & { unused(): RecordedResponse[] } {
  const byKey = new Map(
    recording.responses.map((response) => [keyOf(response.url, response.accept, response.requestBody), response]),
  );
  const used = new Set<string>();
  return {
    now: now ?? new Date(`${recording.recordedAt}T12:00:00Z`),
    async fetchText(url: string, options?: FetchOptions) {
      const key = keyOf(url, options?.accept, options?.body);
      const response = byKey.get(key);
      if (!response) {
        const hint = [
          options?.accept ? `Accept: ${options.accept}` : "",
          options?.body === undefined ? "" : "POST body",
        ]
          .filter(Boolean)
          .join(", ");
        throw new ImporterError(`No recorded response for ${url}${hint ? ` (${hint})` : ""}. Record it with --record.`);
      }
      used.add(key);
      if (response.error !== undefined) throw new ImporterError(response.error);
      return response.body ?? "";
    },
    unused: () =>
      recording.responses.filter((response) => !used.has(keyOf(response.url, response.accept, response.requestBody))),
  };
}

export function validateRecording(value: unknown): Recording {
  const fail = (message: string): never => {
    throw new ImporterError(`Invalid recording: ${message}`);
  };
  if (typeof value !== "object" || value === null) return fail("not an object");
  const recording = value as Partial<Recording>;
  if (recording.schemaVersion !== RECORDING_SCHEMA) fail(`schemaVersion must be "${RECORDING_SCHEMA}"`);
  if (typeof recording.importer !== "string" || !recording.importer) fail("importer is required");
  if (!isIsoDate(recording.recordedAt)) fail("recordedAt must be a date (YYYY-MM-DD)");
  if (!Array.isArray(recording.responses)) return fail("responses must be a list");
  const seen = new Set<string>();
  for (const [index, response] of recording.responses.entries()) {
    if (typeof response?.url !== "string" || !/^https?:\/\//.test(response.url))
      fail(`responses[${index}].url must be a URL`);
    if (response.requestBody !== undefined && typeof response.requestBody !== "string")
      fail(`responses[${index}].requestBody must be a string`);
    if ((response.body === undefined) === (response.error === undefined))
      fail(`responses[${index}] needs exactly one of body or error`);
    const key = keyOf(response.url, response.accept, response.requestBody);
    if (seen.has(key)) fail(`responses[${index}] repeats ${response.url}`);
    seen.add(key);
  }
  return recording as Recording;
}

export async function readRecording(path: string): Promise<Recording> {
  return validateRecording(JSON.parse(await readFile(path, "utf8")) as unknown);
}

const REDACTED = "[REDACTED]";

/** Credential-shaped text: private keys, provider tokens, bearer headers and token-like query parameters. */
const CREDENTIAL_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /(?<=[?&](?:access_token|api[_-]?key|token|secret|password)=)[^&"\s]+/gi,
];

/** Replaces every credential-shaped value in `text` with `[REDACTED]`. Text without one comes back unchanged. */
export function redactCredentials(text: string): string {
  return CREDENTIAL_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, REDACTED), text);
}

function redactRecording(recording: Recording): Recording {
  return {
    ...recording,
    responses: recording.responses.map((response) => ({
      ...response,
      url: redactCredentials(response.url),
      ...(response.requestBody === undefined ? {} : { requestBody: redactCredentials(response.requestBody) }),
      ...(response.body === undefined ? {} : { body: redactCredentials(response.body) }),
      ...(response.error === undefined ? {} : { error: redactCredentials(response.error) }),
    })),
  };
}

/** Writes a recording with credential-shaped values redacted, so a committed recording never holds one. */
export async function writeRecording(path: string, recording: Recording): Promise<void> {
  await writeFile(path, `${JSON.stringify(redactRecording(validateRecording(recording)), null, 2)}\n`);
}
