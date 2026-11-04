import { commands } from "./commands/index.generated.js";
import type { CliCommand } from "./commands/types.js";

export const completionShells = ["bash", "zsh", "fish"] as const;
export type CompletionShell = (typeof completionShells)[number];

interface CommandSpec {
  name: string;
  /** Flags the command accepts, offered after the command name. */
  flags: string[];
  /** One runnable example, shown under `--help`. */
  example: string;
}

const severities = "info low medium high critical none";
const globalFlags = ["--help", "--version"];
const formats = "text json sarif rdjson compact html mermaid";

/**
 * `export` and `sbom` are real commands and appear in the usage text, but they were never part of the completion
 * catalog. Keep them out so the scripts stay byte-stable; every other command, including ones added later, is listed.
 */
const hiddenFromCompletions = new Set(["export", "sbom"]);

/** Historical catalog order, including the duplicate forecast and drift rows the scripts have always emitted. */
const legacyOrder: readonly { name: string; flags?: readonly string[] }[] = [
  { name: "scan" },
  { name: "baseline" },
  { name: "forecast" },
  { name: "forecast", flags: ["--months", "--as-of", "--today", "--timeline", "--json", "--format", "--data-version"] },
  { name: "countdown" },
  { name: "plan" },
  { name: "status-card" },
  { name: "glance" },
  { name: "lookup" },
  { name: "drift" },
  { name: "upgrade-check" },
  { name: "inventory" },
  { name: "badge" },
  { name: "diff" },
  { name: "drift" },
  { name: "receipt" },
  { name: "rollup" },
  { name: "renovate-preset" },
  { name: "dependabot-config" },
  { name: "fix" },
  { name: "check" },
  { name: "check-snippet" },
  { name: "guard" },
  { name: "usage" },
  { name: "mcp" },
  { name: "data" },
  { name: "watch" },
  { name: "init" },
  { name: "setup" },
  { name: "new-detector" },
  { name: "new-rule" },
  { name: "rules" },
  { name: "explain" },
  { name: "context" },
  { name: "doctor" },
  { name: "report-issue" },
  { name: "capabilities" },
  { name: "completions" },
];

function commandSpecs(list: readonly CliCommand[]): CommandSpec[] {
  const byName = new Map(list.map((command) => [command.name, command]));
  const specs = legacyOrder.map((entry) => {
    const command = byName.get(entry.name);
    if (!command) throw new Error(`Completion catalog lists ${entry.name}, which is not a registered command.`);
    return { name: command.name, flags: [...(entry.flags ?? command.flags)], example: command.example };
  });
  const listed = new Set(legacyOrder.map((entry) => entry.name));
  for (const command of list) {
    if (listed.has(command.name) || hiddenFromCompletions.has(command.name)) continue;
    specs.push({ name: command.name, flags: [...command.flags], example: command.example });
  }
  return specs;
}

export const COMMANDS: CommandSpec[] = commandSpecs(commands);

function withSubcommands(list: readonly CliCommand[]): CliCommand[] {
  const selected = list.filter((command) => (command.completion?.subcommands?.length ?? 0) > 0);
  const preferred = ["completions", "data", "watch"];
  return [
    ...preferred.flatMap((name) => selected.filter((command) => command.name === name)),
    ...selected.filter((command) => !preferred.includes(command.name)),
  ];
}

function subcommandWords(command: CliCommand, includeExtra: boolean): string {
  if (command.name === "completions") return completionShells.join(" ");
  const words = [...(command.completion?.subcommands ?? [])];
  if (includeExtra) words.push(...(command.completion?.extraWords ?? []));
  return words.join(" ");
}

const bash = (): string => {
  const cases = COMMANDS.map(({ name, flags }) => `    ${name}) opts="${flags.join(" ")}" ;;`).join("\n");
  const special = withSubcommands(commands)
    .map((command) => `    ${command.name}) opts="${subcommandWords(command, true)}" ;;`)
    .join("\n");
  return `# bash completion for evergreen. Load it with: source <(evergreen completions bash)
_evergreen() {
  local cur prev command opts
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  command="\${COMP_WORDS[1]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "${COMMANDS.map((c) => c.name).join(" ")} ${globalFlags.join(" ")}" -- "$cur"))
    return
  fi
  case "$prev" in
    --format) COMPREPLY=($(compgen -W "${formats}" -- "$cur")); return ;;
    --fail-on) COMPREPLY=($(compgen -W "${severities}" -- "$cur")); return ;;
    --on-expired) COMPREPLY=($(compgen -W "resurface fail" -- "$cur")); return ;;
    --file|--output|--baseline|--all|--before) COMPREPLY=($(compgen -f -- "$cur")); return ;;
  esac
  case "$command" in
${special}
${cases}
    *) opts="" ;;
  esac
  COMPREPLY=($(compgen -W "$opts" -- "$cur"))
  [ \${#COMPREPLY[@]} -eq 0 ] && COMPREPLY=($(compgen -f -- "$cur"))
}
complete -o default -F _evergreen evergreen
`;
};

const zsh = (): string => {
  const subcommandNames = new Set(withSubcommands(commands).map((command) => command.name));
  const cases = COMMANDS.filter((command) => !subcommandNames.has(command.name))
    .map(
      ({ name, flags }) =>
        `        ${name}) _arguments ${flags.map((flag) => `'${flag}'`).join(" ")} '*:path:_files' ;;`,
    )
    .join("\n");
  const special = withSubcommands(commands)
    .map((command) => `    ${command.name}) compadd ${subcommandWords(command, true)} ;;`)
    .join("\n");
  return `#compdef evergreen
# zsh completion for evergreen. Save it as _evergreen in a directory on $fpath, or: source <(evergreen completions zsh)
_evergreen() {
  local -a commands
  commands=(${COMMANDS.map((c) => `'${c.name}'`).join(" ")})
  if (( CURRENT == 2 )); then
    compadd -a commands -- ${globalFlags.join(" ")}
    return
  fi
  case "$words[CURRENT-1]" in
    --format) compadd ${formats}; return ;;
    --fail-on) compadd ${severities}; return ;;
    --on-expired) compadd resurface fail; return ;;
    --file|--output|--baseline|--all|--before) _files; return ;;
  esac
  case "$words[2]" in
${special}
${cases}
  esac
}
compdef _evergreen evergreen
`;
};

const fish = (): string => {
  const lines = [
    "# fish completion for evergreen. Save it as ~/.config/fish/completions/evergreen.fish, or: evergreen completions fish | source",
    "complete -c evergreen -f",
    ...COMMANDS.map(({ name }) => `complete -c evergreen -n __fish_use_subcommand -a ${name}`),
    ...globalFlags.map((flag) => `complete -c evergreen -n __fish_use_subcommand -l ${flag.slice(2)}`),
    ...withSubcommands(commands).map(
      (command) =>
        `complete -c evergreen -n '__fish_seen_subcommand_from ${command.name}' -a '${subcommandWords(command, false)}'`,
    ),
    `complete -c evergreen -n '__fish_seen_subcommand_from scan check' -l fail-on -x -a '${severities}'`,
    `complete -c evergreen -n '__fish_seen_subcommand_from scan' -l format -x -a '${formats}'`,
    `complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l format -x -a '${formats}'`,
    `complete -c evergreen -n '__fish_seen_subcommand_from scan' -l on-expired -x -a 'resurface fail'`,
    ...COMMANDS.flatMap(({ name, flags }) =>
      flags
        .filter(
          (flag) =>
            !(flag === "--fail-on" && (name === "scan" || name === "check")) &&
            !(flag === "--format" && name === "scan") &&
            !(flag === "--on-expired" && name === "scan"),
        )
        .map((flag) => `complete -c evergreen -n '__fish_seen_subcommand_from ${name}' -l ${flag.slice(2)}`),
    ),
  ];
  return `${lines.join("\n")}\n`;
};

/** The completion script for `shell`, written to stdout by `evergreen completions <shell>`. */
export function renderCompletions(shell: CompletionShell): string {
  return shell === "bash" ? bash() : shell === "zsh" ? zsh() : fish();
}

export function isCompletionShell(value: string | undefined): value is CompletionShell {
  return (completionShells as readonly string[]).includes(value ?? "");
}

/** The `Examples:` block of `--help`: one line per completion-catalog entry, including the historical duplicates. */
export function renderExamples(): string {
  return `Examples:\n${COMMANDS.map((c) => `  ${c.example}`).join("\n")}\n`;
}

/** Full `--help` text. Usage lines keep their historical positions; a command without slots is appended. */
export function renderHelp(list: readonly CliCommand[] = commands): string {
  const placed: { slot: number; line: string }[] = [];
  let append = 1000;
  for (const command of list) {
    command.usage.forEach((line, index) => {
      const slot = command.usageSlots?.[index];
      placed.push({ slot: slot ?? append++, line });
    });
  }
  placed.sort((left, right) => left.slot - right.slot);
  return `Evergreen — local-first deprecation intelligence

Usage:
${placed.map((entry) => entry.line).join("\n")}
  evergreen --debug …   # on unexpected failures, print the stack trace
  evergreen --help
  evergreen --version

${renderExamples()}`;
}
