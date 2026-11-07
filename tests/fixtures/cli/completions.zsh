#compdef evergreen
# zsh completion for evergreen. Save it as _evergreen in a directory on $fpath, or: source <(evergreen completions zsh)
_evergreen() {
  local -a commands
  commands=('scan' 'baseline' 'forecast' 'forecast' 'countdown' 'plan' 'status-card' 'glance' 'lookup' 'drift' 'upgrade-check' 'inventory' 'badge' 'diff' 'drift' 'receipt' 'rollup' 'renovate-preset' 'dependabot-config' 'fix' 'check' 'check-snippet' 'guard' 'usage' 'mcp' 'data' 'watch' 'init' 'setup' 'new-detector' 'new-rule' 'rules' 'explain' 'context' 'doctor' 'report-issue' 'capabilities' 'completions' 'hook' 'verify')
  if (( CURRENT == 2 )); then
    compadd -a commands -- --help --version
    return
  fi
  case "$words[CURRENT-1]" in
    --format) compadd text json sarif rdjson compact html mermaid; return ;;
    --fail-on) compadd info low medium high critical none; return ;;
    --on-expired) compadd resurface fail; return ;;
    --file|--output|--baseline|--all|--before) _files; return ;;
  esac
  case "$words[2]" in
    completions) compadd bash zsh fish ;;
    data) compadd status update --json --data-version ;;
    watch) compadd add remove run list --weekly --json ;;
        scan) _arguments '--demo' '--json' '--format' '--baseline' '--baseline-warn-days' '--on-expired' '--today' '--write-status' '--interactive' '--fail-on' '--all' '--by-owner' '--data-version' '--only' '--exclude' '*:path:_files' ;;
        baseline) _arguments '--output' '--data-version' '*:path:_files' ;;
        forecast) _arguments '--months' '--as-of' '--today' '--svg' '--animate' '--timeline' '--json' '--format' '--data-version' '*:path:_files' ;;
        forecast) _arguments '--months' '--as-of' '--today' '--timeline' '--json' '--format' '--data-version' '*:path:_files' ;;
        countdown) _arguments '--as-of' '--limit' '--json' '--once' '--no-animation' '--no-cache' '--data-version' '*:path:_files' ;;
        plan) _arguments '--json' '--wave' '--data-version' '*:path:_files' ;;
        status-card) _arguments '--name' '*:path:_files' ;;
        glance) _arguments '--as-of' '--json' '*:path:_files' ;;
        lookup) _arguments '--json' '*:path:_files' ;;
        drift) _arguments '--json' '--check' '--runtime' '--align' '*:path:_files' ;;
        upgrade-check) _arguments '--to' '--json' '*:path:_files' ;;
        inventory) _arguments '--format' '--json' '--fail-on' '--redact' '*:path:_files' ;;
        badge) _arguments '--snippet' '--repo' '--branch' '--shields' '*:path:_files' ;;
        diff) _arguments '--json' '--data-version' '*:path:_files' ;;
        drift) _arguments '--json' '--check' '--runtime' '--align' '*:path:_files' ;;
        receipt) _arguments '--before' '--format' '--fail-on-introduced' '--json' '*:path:_files' ;;
        rollup) _arguments '--owners' '--json' '--html' '--format' '*:path:_files' ;;
        renovate-preset) _arguments '--data-version' '*:path:_files' ;;
        dependabot-config) _arguments '--data-version' '*:path:_files' ;;
        fix) _arguments '--dry-run' '--show' '--no-animation' '--data-version' '*:path:_files' ;;
        check) _arguments '--fail-on' '--json' '--format' '--data-version' '*:path:_files' ;;
        check-snippet) _arguments '--path' '--json' '*:path:_files' ;;
        guard) _arguments '--fail-on' '--force' '--data-version' '*:path:_files' ;;
        usage) _arguments '--file' '--json' '*:path:_files' ;;
        mcp) _arguments  '*:path:_files' ;;
        init) _arguments '--agents' '--hooks' '--personal' '--hooks-for' '--file' '--fail-on' '--yes' '--dry-run' '*:path:_files' ;;
        setup) _arguments '--yes' '--dry-run' '*:path:_files' ;;
        new-detector) _arguments '--ecosystem' '*:path:_files' ;;
        new-rule) _arguments '--ecosystem' '*:path:_files' ;;
        rules) _arguments  '*:path:_files' ;;
        explain) _arguments '--json' '--data-version' '*:path:_files' ;;
        context) _arguments '--json' '--data-version' '*:path:_files' ;;
        doctor) _arguments '--system' '--json' '--data-version' '*:path:_files' ;;
        report-issue) _arguments '--output' '--data-version' '*:path:_files' ;;
        capabilities) _arguments '--json' '*:path:_files' ;;
        hook) _arguments '--fail-on' '*:path:_files' ;;
        verify) _arguments '--data-version' '*:path:_files' ;;
  esac
}
compdef _evergreen evergreen
