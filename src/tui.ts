import { spawnSync } from "node:child_process";
import { emitKeypressEvents } from "node:readline";
import { isAbsolute, relative, resolve } from "node:path";

import type { Finding, ScanResult } from "./domain.js";
import { renderFindingText } from "./reporters.js";

export interface BrowserState {
  view: "list" | "detail";
  selected: number;
  /** Set when the user asked to open the selected finding in their editor. */
  open?: boolean;
  quit?: boolean;
}

export interface Key {
  name?: string;
  ctrl?: boolean;
  sequence?: string;
}

/** The browser needs a real terminal on both ends; anything else gets the plain text report. */
export function canBrowse(input: { isTTY?: boolean }, output: { isTTY?: boolean }): boolean {
  return Boolean(input.isTTY && output.isTTY);
}

/** Pure key handling, so the behavior is testable without a terminal. */
export function reduce(state: BrowserState, key: Key, count: number): BrowserState {
  const { open: _open, ...base } = state;
  const name = key.ctrl && key.name === "c" ? "q" : key.name ?? key.sequence;
  if (name === "q") return { ...base, quit: true };
  if (state.view === "detail") {
    if (name === "o") return { ...base, open: true };
    if (name === "escape" || name === "b" || name === "left") return { ...base, view: "list" };
    return base;
  }
  if (count === 0) return base;
  if (name === "down" || name === "j") return { ...base, selected: Math.min(count - 1, state.selected + 1) };
  if (name === "up" || name === "k") return { ...base, selected: Math.max(0, state.selected - 1) };
  if (name === "return" || name === "right") return { ...base, view: "detail" };
  if (name === "o") return { ...base, open: true };
  return base;
}

const location = (finding: Finding): string => `${finding.location.path}${finding.location.line ? `:${finding.location.line}` : ""}`;

export function renderList(result: ScanResult, selected: number): string {
  if (result.findings.length === 0) return "Evergreen: no findings.\n";
  const lines = [`Evergreen — ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} in ${result.root}`, ""];
  result.findings.forEach((finding, index) => {
    lines.push(`${index === selected ? ">" : " "} ${finding.severity.toUpperCase().padEnd(8)} ${finding.title}  ${location(finding)}`);
  });
  lines.push("", "↑/↓ or j/k move · enter details · o open in editor · q quit");
  return `${lines.join("\n")}\n`;
}

export function renderDetail(finding: Finding): string {
  return `${renderFindingText(finding)}\n\no open in editor · b or esc back · q quit\n`;
}

/**
 * Builds the editor invocation for a finding. The editor comes from $VISUAL or $EDITOR (the user's own setting) and is
 * run without a shell. Returns undefined when the finding's path would leave the scanned repository.
 */
export function editorCommand(root: string, finding: Finding, env: NodeJS.ProcessEnv = process.env): { command: string; args: string[] } | undefined {
  const file = resolve(root, finding.location.path);
  const inside = relative(resolve(root), file);
  if (inside === ".." || inside.startsWith("..") || isAbsolute(inside)) return undefined;
  const [command, ...extra] = (env.VISUAL || env.EDITOR || "vi").trim().split(/\s+/);
  if (!command) return undefined;
  const line = finding.location.line;
  const name = command.replace(/^.*[\\/]/, "").replace(/\.(cmd|exe)$/i, "");
  if (!line) return { command, args: [...extra, file] };
  if (name === "code" || name === "codium" || name === "cursor") return { command, args: [...extra, "--goto", `${file}:${line}`] };
  if (name === "subl" || name === "zed" || name === "mate") return { command, args: [...extra, `${file}:${line}`] };
  return { command, args: [...extra, `+${line}`, file] };
}

const CLEAR = "\u001b[2J\u001b[H";

/** Runs the browser until the user quits. Resolves once the terminal is restored. */
export async function browseFindings(
  result: ScanResult,
  io: { input: NodeJS.ReadStream; output: NodeJS.WriteStream; env?: NodeJS.ProcessEnv },
): Promise<void> {
  const { input, output } = io;
  const env = io.env ?? process.env;
  if (result.findings.length === 0) {
    output.write(renderList(result, 0));
    return;
  }
  const draw = (state: BrowserState): void => {
    const finding = result.findings[state.selected]!;
    output.write(CLEAR + (state.view === "list" ? renderList(result, state.selected) : renderDetail(finding)));
  };
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  let state: BrowserState = { view: "list", selected: 0 };
  draw(state);
  await new Promise<void>((done) => {
    const onKey = (_text: string | undefined, key: Key | undefined): void => {
      state = reduce(state, key ?? {}, result.findings.length);
      if (state.quit) {
        input.off("keypress", onKey);
        done();
        return;
      }
      if (state.open) {
        const command = editorCommand(result.root, result.findings[state.selected]!, env);
        if (command) {
          input.setRawMode(false);
          spawnSync(command.command, command.args, { stdio: "inherit" });
          input.setRawMode(true);
        }
      }
      draw(state);
    };
    input.on("keypress", onKey);
  });
  input.setRawMode(false);
  input.pause();
  output.write(CLEAR);
}
