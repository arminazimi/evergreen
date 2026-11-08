# Shell prompt segment

`evergreen prompt` prints a short segment for your shell prompt, such as `⏳2`, when the repository you are in has lifecycle findings. It prints nothing otherwise.

```bash
evergreen prompt [path] [--format <text|json>] [--symbol <s>]
```

| Flag | What it does |
| --- | --- |
| `[path]` | Directory to look at. Default `.`. |
| `--format <text\|json>` | `text` (default) prints the segment. `json` prints an `evergreen.prompt.v1` document with `cached`, `total`, `urgent`, and `count`. |
| `--symbol <s>` | The symbol before the count. Default `⏳`. `--symbol EOL:` gives ASCII. |

The count is the high and critical findings when there are any, otherwise all findings.

## What it reads

The command reads only the scan cache for the repository root (the nearest folder with a `.git`). It never scans, never starts a process, and never uses the network. It always exits `0`.

It prints nothing when the cache is missing or stale. The cache is stale when a file the scan read changed or disappeared after the scan, or when the scan is more than seven days old.

Refresh the cache with any of these:

- `evergreen scan` writes it.
- `evergreen watch` updates it on every change.
- The pre-push hook (`evergreen init --hooks`) scans before each push, which updates it.

A cold start is kept light: `evergreen prompt` loads only its own module, not the command table or the detectors. On a warm cache it runs in under 50 ms at the 95th percentile (`tests/prompt-segment.test.ts` measures 50 runs).

## Snippets

Each snippet runs the command only inside a git repository.

### Starship

Add to `~/.config/starship.toml`:

```toml
[custom.evergreen]
command = "evergreen prompt"
when = "git rev-parse --is-inside-work-tree"
format = "[$output]($style) "
style = "bold yellow"
```

### oh-my-zsh

Add to your theme file (or `~/.zshrc` after `source $ZSH/oh-my-zsh.sh`):

```zsh
evergreen_prompt_info() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return
  local segment
  segment="$(evergreen prompt)"
  [[ -n "$segment" ]] && echo "%{$fg_bold[yellow]%}${segment}%{$reset_color%} "
}
PROMPT='$(evergreen_prompt_info)'"$PROMPT"
```

### Powerlevel10k

In `~/.p10k.zsh`, add `evergreen` to `POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS` and define the segment:

```zsh
function prompt_evergreen() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return
  local segment
  segment="$(evergreen prompt)"
  [[ -n "$segment" ]] && p10k segment -f 178 -t "$segment"
}
```

### fish

In `~/.config/fish/functions/fish_right_prompt.fish`:

```fish
function fish_right_prompt
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1
        set -l segment (evergreen prompt)
        if test -n "$segment"
            set_color yellow
            echo -n $segment
            set_color normal
        end
    end
end
```

### bash

In `~/.bashrc`:

```bash
__evergreen_prompt() {
  local segment=""
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    segment="$(evergreen prompt)"
  fi
  PS1="${__evergreen_base_ps1}${segment:+\[\e[33m\]${segment}\[\e[0m\] }"
}
__evergreen_base_ps1="$PS1"
PROMPT_COMMAND="__evergreen_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
```

## Also see

- [CLI reference](CLI.md#prompt)
- [Showcase](SHOWCASE.md#shell-prompt-segment)
