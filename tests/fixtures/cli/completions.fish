# fish completion for evergreen. Save it as ~/.config/fish/completions/evergreen.fish, or: evergreen completions fish | source
complete -c evergreen -f
complete -c evergreen -n __fish_use_subcommand -a scan
complete -c evergreen -n __fish_use_subcommand -a baseline
complete -c evergreen -n __fish_use_subcommand -a forecast
complete -c evergreen -n __fish_use_subcommand -a forecast
complete -c evergreen -n __fish_use_subcommand -a countdown
complete -c evergreen -n __fish_use_subcommand -a plan
complete -c evergreen -n __fish_use_subcommand -a status-card
complete -c evergreen -n __fish_use_subcommand -a glance
complete -c evergreen -n __fish_use_subcommand -a lookup
complete -c evergreen -n __fish_use_subcommand -a drift
complete -c evergreen -n __fish_use_subcommand -a upgrade-check
complete -c evergreen -n __fish_use_subcommand -a inventory
complete -c evergreen -n __fish_use_subcommand -a badge
complete -c evergreen -n __fish_use_subcommand -a diff
complete -c evergreen -n __fish_use_subcommand -a drift
complete -c evergreen -n __fish_use_subcommand -a receipt
complete -c evergreen -n __fish_use_subcommand -a rollup
complete -c evergreen -n __fish_use_subcommand -a renovate-preset
complete -c evergreen -n __fish_use_subcommand -a dependabot-config
complete -c evergreen -n __fish_use_subcommand -a fix
complete -c evergreen -n __fish_use_subcommand -a check
complete -c evergreen -n __fish_use_subcommand -a check-snippet
complete -c evergreen -n __fish_use_subcommand -a guard
complete -c evergreen -n __fish_use_subcommand -a usage
complete -c evergreen -n __fish_use_subcommand -a mcp
complete -c evergreen -n __fish_use_subcommand -a data
complete -c evergreen -n __fish_use_subcommand -a watch
complete -c evergreen -n __fish_use_subcommand -a init
complete -c evergreen -n __fish_use_subcommand -a setup
complete -c evergreen -n __fish_use_subcommand -a new-detector
complete -c evergreen -n __fish_use_subcommand -a new-rule
complete -c evergreen -n __fish_use_subcommand -a rules
complete -c evergreen -n __fish_use_subcommand -a explain
complete -c evergreen -n __fish_use_subcommand -a context
complete -c evergreen -n __fish_use_subcommand -a doctor
complete -c evergreen -n __fish_use_subcommand -a report-issue
complete -c evergreen -n __fish_use_subcommand -a capabilities
complete -c evergreen -n __fish_use_subcommand -a completions
complete -c evergreen -n __fish_use_subcommand -a hook
complete -c evergreen -n __fish_use_subcommand -a prompt
complete -c evergreen -n __fish_use_subcommand -a recommend
complete -c evergreen -n __fish_use_subcommand -a timelapse
complete -c evergreen -n __fish_use_subcommand -a verify
complete -c evergreen -n __fish_use_subcommand -a wrapped
complete -c evergreen -n __fish_use_subcommand -l help
complete -c evergreen -n __fish_use_subcommand -l version
complete -c evergreen -n '__fish_seen_subcommand_from completions' -a 'bash zsh fish'
complete -c evergreen -n '__fish_seen_subcommand_from data' -a 'status update'
complete -c evergreen -n '__fish_seen_subcommand_from watch' -a 'add remove run list'
complete -c evergreen -n '__fish_seen_subcommand_from scan check' -l fail-on -x -a 'info low medium high critical none'
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l format -x -a 'text json sarif rdjson compact html mermaid'
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l format -x -a 'text json sarif rdjson compact html mermaid'
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l on-expired -x -a 'resurface fail'
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l demo
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l json
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l baseline
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l baseline-warn-days
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l today
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l write-status
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l interactive
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l all
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l by-owner
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l only
complete -c evergreen -n '__fish_seen_subcommand_from scan' -l exclude
complete -c evergreen -n '__fish_seen_subcommand_from baseline' -l output
complete -c evergreen -n '__fish_seen_subcommand_from baseline' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l months
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l as-of
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l today
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l svg
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l animate
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l timeline
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l json
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l format
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l months
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l as-of
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l today
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l timeline
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l json
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l format
complete -c evergreen -n '__fish_seen_subcommand_from forecast' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from countdown' -l as-of
complete -c evergreen -n '__fish_seen_subcommand_from countdown' -l limit
complete -c evergreen -n '__fish_seen_subcommand_from countdown' -l json
complete -c evergreen -n '__fish_seen_subcommand_from countdown' -l once
complete -c evergreen -n '__fish_seen_subcommand_from countdown' -l no-animation
complete -c evergreen -n '__fish_seen_subcommand_from countdown' -l no-cache
complete -c evergreen -n '__fish_seen_subcommand_from countdown' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from plan' -l json
complete -c evergreen -n '__fish_seen_subcommand_from plan' -l wave
complete -c evergreen -n '__fish_seen_subcommand_from plan' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from status-card' -l name
complete -c evergreen -n '__fish_seen_subcommand_from glance' -l as-of
complete -c evergreen -n '__fish_seen_subcommand_from glance' -l json
complete -c evergreen -n '__fish_seen_subcommand_from lookup' -l json
complete -c evergreen -n '__fish_seen_subcommand_from drift' -l json
complete -c evergreen -n '__fish_seen_subcommand_from drift' -l check
complete -c evergreen -n '__fish_seen_subcommand_from drift' -l runtime
complete -c evergreen -n '__fish_seen_subcommand_from drift' -l align
complete -c evergreen -n '__fish_seen_subcommand_from upgrade-check' -l to
complete -c evergreen -n '__fish_seen_subcommand_from upgrade-check' -l json
complete -c evergreen -n '__fish_seen_subcommand_from inventory' -l format
complete -c evergreen -n '__fish_seen_subcommand_from inventory' -l json
complete -c evergreen -n '__fish_seen_subcommand_from inventory' -l fail-on
complete -c evergreen -n '__fish_seen_subcommand_from inventory' -l redact
complete -c evergreen -n '__fish_seen_subcommand_from badge' -l snippet
complete -c evergreen -n '__fish_seen_subcommand_from badge' -l repo
complete -c evergreen -n '__fish_seen_subcommand_from badge' -l branch
complete -c evergreen -n '__fish_seen_subcommand_from badge' -l shields
complete -c evergreen -n '__fish_seen_subcommand_from diff' -l json
complete -c evergreen -n '__fish_seen_subcommand_from diff' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from drift' -l json
complete -c evergreen -n '__fish_seen_subcommand_from drift' -l check
complete -c evergreen -n '__fish_seen_subcommand_from drift' -l runtime
complete -c evergreen -n '__fish_seen_subcommand_from drift' -l align
complete -c evergreen -n '__fish_seen_subcommand_from receipt' -l before
complete -c evergreen -n '__fish_seen_subcommand_from receipt' -l format
complete -c evergreen -n '__fish_seen_subcommand_from receipt' -l fail-on-introduced
complete -c evergreen -n '__fish_seen_subcommand_from receipt' -l json
complete -c evergreen -n '__fish_seen_subcommand_from rollup' -l owners
complete -c evergreen -n '__fish_seen_subcommand_from rollup' -l json
complete -c evergreen -n '__fish_seen_subcommand_from rollup' -l html
complete -c evergreen -n '__fish_seen_subcommand_from rollup' -l format
complete -c evergreen -n '__fish_seen_subcommand_from renovate-preset' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from dependabot-config' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from fix' -l dry-run
complete -c evergreen -n '__fish_seen_subcommand_from fix' -l show
complete -c evergreen -n '__fish_seen_subcommand_from fix' -l no-animation
complete -c evergreen -n '__fish_seen_subcommand_from fix' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from check' -l json
complete -c evergreen -n '__fish_seen_subcommand_from check' -l format
complete -c evergreen -n '__fish_seen_subcommand_from check' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from check-snippet' -l path
complete -c evergreen -n '__fish_seen_subcommand_from check-snippet' -l json
complete -c evergreen -n '__fish_seen_subcommand_from guard' -l fail-on
complete -c evergreen -n '__fish_seen_subcommand_from guard' -l force
complete -c evergreen -n '__fish_seen_subcommand_from guard' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from usage' -l file
complete -c evergreen -n '__fish_seen_subcommand_from usage' -l json
complete -c evergreen -n '__fish_seen_subcommand_from data' -l json
complete -c evergreen -n '__fish_seen_subcommand_from data' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from watch' -l weekly
complete -c evergreen -n '__fish_seen_subcommand_from watch' -l board
complete -c evergreen -n '__fish_seen_subcommand_from watch' -l json
complete -c evergreen -n '__fish_seen_subcommand_from init' -l agents
complete -c evergreen -n '__fish_seen_subcommand_from init' -l hooks
complete -c evergreen -n '__fish_seen_subcommand_from init' -l personal
complete -c evergreen -n '__fish_seen_subcommand_from init' -l hooks-for
complete -c evergreen -n '__fish_seen_subcommand_from init' -l file
complete -c evergreen -n '__fish_seen_subcommand_from init' -l fail-on
complete -c evergreen -n '__fish_seen_subcommand_from init' -l yes
complete -c evergreen -n '__fish_seen_subcommand_from init' -l dry-run
complete -c evergreen -n '__fish_seen_subcommand_from setup' -l yes
complete -c evergreen -n '__fish_seen_subcommand_from setup' -l dry-run
complete -c evergreen -n '__fish_seen_subcommand_from new-detector' -l ecosystem
complete -c evergreen -n '__fish_seen_subcommand_from new-rule' -l ecosystem
complete -c evergreen -n '__fish_seen_subcommand_from explain' -l json
complete -c evergreen -n '__fish_seen_subcommand_from explain' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from context' -l json
complete -c evergreen -n '__fish_seen_subcommand_from context' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from doctor' -l system
complete -c evergreen -n '__fish_seen_subcommand_from doctor' -l json
complete -c evergreen -n '__fish_seen_subcommand_from doctor' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from report-issue' -l output
complete -c evergreen -n '__fish_seen_subcommand_from report-issue' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from capabilities' -l json
complete -c evergreen -n '__fish_seen_subcommand_from hook' -l fail-on
complete -c evergreen -n '__fish_seen_subcommand_from prompt' -l format
complete -c evergreen -n '__fish_seen_subcommand_from prompt' -l symbol
complete -c evergreen -n '__fish_seen_subcommand_from recommend' -l min-days
complete -c evergreen -n '__fish_seen_subcommand_from recommend' -l as-of
complete -c evergreen -n '__fish_seen_subcommand_from recommend' -l json
complete -c evergreen -n '__fish_seen_subcommand_from timelapse' -l from
complete -c evergreen -n '__fish_seen_subcommand_from timelapse' -l to
complete -c evergreen -n '__fish_seen_subcommand_from timelapse' -l svg
complete -c evergreen -n '__fish_seen_subcommand_from timelapse' -l json
complete -c evergreen -n '__fish_seen_subcommand_from timelapse' -l no-animation
complete -c evergreen -n '__fish_seen_subcommand_from verify' -l data-version
complete -c evergreen -n '__fish_seen_subcommand_from wrapped' -l year
complete -c evergreen -n '__fish_seen_subcommand_from wrapped' -l svg
complete -c evergreen -n '__fish_seen_subcommand_from wrapped' -l json
complete -c evergreen -n '__fish_seen_subcommand_from wrapped' -l no-animation
