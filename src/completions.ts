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

export const COMMANDS: CommandSpec[] = [
  { name: "scan", flags: ["--demo", "--json", "--format", "--baseline", "--baseline-warn-days", "--on-expired", "--today", "--write-status", "--interactive", "--fail-on", "--all", "--by-owner", "--data-version", "--only", "--exclude"], example: "evergreen scan . --fail-on high" },
  { name: "baseline", flags: ["--output", "--data-version"], example: "evergreen baseline . --output evergreen-baseline.json" },
  { name: "forecast", flags: ["--months", "--as-of", "--today", "--json", "--data-version"], example: "evergreen forecast . --months 6" },
  { name: "diff", flags: ["--json", "--data-version"], example: "evergreen diff main..HEAD" },
  { name: "rollup", flags: ["--owners", "--json", "--html", "--format"], example: "evergreen rollup reports/*.json --owners owners.json --html" },
  { name: "renovate-preset", flags: ["--data-version"], example: "evergreen renovate-preset ." },
  { name: "fix", flags: ["--dry-run", "--data-version"], example: "evergreen fix . --dry-run" },
  { name: "check", flags: ["--fail-on", "--json", "--format", "--data-version"], example: "evergreen check pkg:npm/request@2.88.2" },
  { name: "guard", flags: ["--fail-on", "--force", "--data-version"], example: "evergreen guard npm install request" },
  { name: "usage", flags: ["--file", "--json"], example: "evergreen usage --json" },
  { name: "mcp", flags: [], example: "evergreen mcp" },
  { name: "data", flags: ["--json", "--data-version"], example: "evergreen data status" },
  { name: "watch", flags: ["--weekly", "--json"], example: "evergreen watch add ~/code/my-app" },
  { name: "init", flags: ["--agents", "--hooks", "--personal", "--file", "--fail-on", "--yes", "--dry-run"], example: "evergreen init --hooks --dry-run" },
  { name: "setup", flags: ["--yes", "--dry-run"], example: "evergreen setup --dry-run" },
  { name: "new-detector", flags: ["--ecosystem"], example: "evergreen new-detector my-lang --ecosystem my-lang" },
  { name: "rules", flags: ["--json"], example: "evergreen rules lint registry" },
  { name: "explain", flags: ["--json", "--data-version"], example: "evergreen explain <finding-id> ." },
  { name: "context", flags: ["--json", "--data-version"], example: "evergreen context <finding-id> ." },
  { name: "doctor", flags: ["--system", "--json", "--data-version"], example: "evergreen doctor --system" },
  { name: "report-issue", flags: ["--output", "--data-version"], example: "evergreen report-issue <finding-id> . --output issue.md" },
  { name: "capabilities", flags: ["--json"], example: "evergreen capabilities --json" },
  { name: "completions", flags: [], example: "evergreen completions zsh > ~/.zfunc/_evergreen" },
];

const globalFlags = ["--help", "--version"];
const formats = "text json sarif rdjson compact html";

const bash = (): string => {
  const cases = COMMANDS.map(({ name, flags }) => `    ${name}) opts="${flags.join(" ")}" ;;`).join("\n");
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
    --file|--output|--baseline|--all) COMPREPLY=($(compgen -f -- "$cur")); return ;;
  esac
  case "$command" in
    completions) opts="${completionShells.join(" ")}" ;;
    data) opts="status update --json --data-version" ;;
    watch) opts="add remove run list --weekly --json" ;;
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
  const cases = COMMANDS.filter((c) => c.name !== "completions" && c.name !== "data" && c.name !== "watch")
    .map(({ name, flags }) => `        ${name}) _arguments ${flags.map((flag) => `'${flag}'`).join(" ")} '*:path:_files' ;;`)
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
    --file|--output|--baseline|--all) _files; return ;;
  esac
  case "$words[2]" in
    completions) compadd ${completionShells.join(" ")} ;;
    data) compadd status update --json --data-version ;;
    watch) compadd add remove run list --weekly --json ;;
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
    `complete -c evergreen -n '__fish_seen_subcommand_from completions' -a '${completionShells.join(" ")}'`,
    `complete -c evergreen -n '__fish_seen_subcommand_from data' -a 'status update'`,
    `complete -c evergreen -n '__fish_seen_subcommand_from watch' -a 'add remove run list'`,
    `complete -c evergreen -n '__fish_seen_subcommand_from scan check' -l fail-on -x -a '${severities}'`,
    `complete -c evergreen -n '__fish_seen_subcommand_from scan' -l format -x -a '${formats}'`,
    `complete -c evergreen -n '__fish_seen_subcommand_from scan' -l on-expired -x -a 'resurface fail'`,
    ...COMMANDS.flatMap(({ name, flags }) =>
      flags
        .filter((flag) => !(flag === "--fail-on" && (name === "scan" || name === "check")) && !(flag === "--format" && name === "scan") && !(flag === "--on-expired" && name === "scan"))
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

/** The `Examples:` block of `--help`: one line per command. */
export function renderExamples(): string {
  return `Examples:\n${COMMANDS.map((c) => `  ${c.example}`).join("\n")}\n`;
}
