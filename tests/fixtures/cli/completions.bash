# bash completion for evergreen. Load it with: source <(evergreen completions bash)
_evergreen() {
  local cur prev command opts
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  command="${COMP_WORDS[1]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "scan baseline forecast forecast countdown plan status-card glance lookup drift upgrade-check inventory badge diff drift receipt rollup renovate-preset dependabot-config fix check check-snippet guard usage mcp data watch init setup new-detector new-rule rules explain context doctor report-issue capabilities completions hook --help --version" -- "$cur"))
    return
  fi
  case "$prev" in
    --format) COMPREPLY=($(compgen -W "text json sarif rdjson compact html mermaid" -- "$cur")); return ;;
    --fail-on) COMPREPLY=($(compgen -W "info low medium high critical none" -- "$cur")); return ;;
    --on-expired) COMPREPLY=($(compgen -W "resurface fail" -- "$cur")); return ;;
    --file|--output|--baseline|--all|--before) COMPREPLY=($(compgen -f -- "$cur")); return ;;
  esac
  case "$command" in
    completions) opts="bash zsh fish" ;;
    data) opts="status update --json --data-version" ;;
    watch) opts="add remove run list --weekly --json" ;;
    scan) opts="--demo --json --format --baseline --baseline-warn-days --on-expired --today --write-status --interactive --fail-on --all --by-owner --data-version --only --exclude" ;;
    baseline) opts="--output --data-version" ;;
    forecast) opts="--months --as-of --today --svg --animate --timeline --json --format --data-version" ;;
    forecast) opts="--months --as-of --today --timeline --json --format --data-version" ;;
    countdown) opts="--as-of --limit --json --once --no-animation --no-cache --data-version" ;;
    plan) opts="--json --wave --data-version" ;;
    status-card) opts="--name" ;;
    glance) opts="--as-of --json" ;;
    lookup) opts="--json" ;;
    drift) opts="--json --check --runtime --align" ;;
    upgrade-check) opts="--to --json" ;;
    inventory) opts="--format --json --fail-on --redact" ;;
    badge) opts="--snippet --repo --branch --shields" ;;
    diff) opts="--json --data-version" ;;
    drift) opts="--json --check --runtime --align" ;;
    receipt) opts="--before --format --fail-on-introduced --json" ;;
    rollup) opts="--owners --json --html --format" ;;
    renovate-preset) opts="--data-version" ;;
    dependabot-config) opts="--data-version" ;;
    fix) opts="--dry-run --data-version" ;;
    check) opts="--fail-on --json --format --data-version" ;;
    check-snippet) opts="--path --json" ;;
    guard) opts="--fail-on --force --data-version" ;;
    usage) opts="--file --json" ;;
    mcp) opts="" ;;
    data) opts="--json --data-version" ;;
    watch) opts="--weekly --json" ;;
    init) opts="--agents --hooks --personal --hooks-for --file --fail-on --yes --dry-run" ;;
    setup) opts="--yes --dry-run" ;;
    new-detector) opts="--ecosystem" ;;
    new-rule) opts="--ecosystem" ;;
    rules) opts="" ;;
    explain) opts="--json --data-version" ;;
    context) opts="--json --data-version" ;;
    doctor) opts="--system --json --data-version" ;;
    report-issue) opts="--output --data-version" ;;
    capabilities) opts="--json" ;;
    completions) opts="" ;;
    hook) opts="--fail-on" ;;
    *) opts="" ;;
  esac
  COMPREPLY=($(compgen -W "$opts" -- "$cur"))
  [ ${#COMPREPLY[@]} -eq 0 ] && COMPREPLY=($(compgen -f -- "$cur"))
}
complete -o default -F _evergreen evergreen
