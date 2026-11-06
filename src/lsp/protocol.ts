// JSON-RPC framing and the shared JSON helpers every language-server module uses.

export const LANGUAGE_SERVER_NAME = "evergreen";
export const DIAGNOSTIC_SOURCE = "Evergreen";
export const EXPLAIN_FINDING_COMMAND = "evergreen.explainFinding";
export const OPEN_EVIDENCE_COMMAND = "evergreen.openEvidence";

export const MESSAGE_TYPE = { error: 1, warning: 2, info: 3, log: 4 } as const;

export const TEXT_DOCUMENT_SYNC_FULL = 1;
const MAX_HEADER_BYTES = 8192;

export type JsonObject = Record<string, unknown>;

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

/** Writes one JSON-RPC message with the LSP `Content-Length` framing. */
export function writeFramedMessage(output: NodeJS.WritableStream, message: unknown): void {
  const body = JSON.stringify(message);
  output.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

/** Reads `Content-Length` framed JSON-RPC messages from a stream. */
export function readFramedMessages(
  input: NodeJS.ReadableStream,
  onMessage: (message: JsonObject) => void,
  onError: (error: Error) => void = () => {},
): void {
  let buffer = Buffer.alloc(0);
  input.on("data", (chunk: Buffer | string) => {
    buffer = Buffer.concat([buffer, typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        if (buffer.length > MAX_HEADER_BYTES) {
          onError(new Error(`LSP message header exceeds ${MAX_HEADER_BYTES} bytes without a terminator.`));
          buffer = Buffer.alloc(0);
        }
        return;
      }
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const length = /(?:^|\r\n)content-length:\s*(\d+)/i.exec(header);
      if (!length) {
        onError(new Error("LSP message has no Content-Length header."));
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const start = headerEnd + 4;
      const end = start + Number(length[1]);
      if (buffer.length < end) return;
      const body = buffer.subarray(start, end).toString("utf8");
      buffer = buffer.subarray(end);
      try {
        const parsed: unknown = JSON.parse(body);
        if (isJsonObject(parsed)) {
          onMessage(parsed);
        } else {
          onError(new Error("LSP message is not a JSON object."));
        }
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });
  input.on("error", onError);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function stringField(object: JsonObject | undefined, key: string): string | undefined {
  const value = object?.[key];
  return typeof value === "string" ? value : undefined;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asObject(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

export function asPosition(value: JsonObject | undefined): LspPosition | undefined {
  if (!value || typeof value.line !== "number" || typeof value.character !== "number") return undefined;
  return { line: value.line, character: value.character };
}

export function asRange(value: unknown): LspRange | undefined {
  const object = asObject(value);
  const start = asPosition(asObject(object?.start));
  const end = asPosition(asObject(object?.end));
  return start && end ? { start, end } : undefined;
}
