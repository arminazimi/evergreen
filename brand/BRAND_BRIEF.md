# Evergreen brand brief

| Field | Value |
| --- | --- |
| Version | `1.0.0` |
| Status | Approved |
| Effective date | 2026-10-14 |
| Applies to | Product, documentation, CLI, MCP server, GitHub Action, Agent Skill, and detectors |

## Brand foundation

Evergreen is local-first deprecation intelligence for software repositories. It
connects upcoming ecosystem changes to the exact files and usages they affect,
then packages authoritative evidence and verification guidance for humans and
coding agents.

### Positioning

For maintainers and platform teams responsible for software that must keep
working over time, Evergreen is the deprecation intelligence engine that shows
what is becoming unsupported, where the repository depends on it, and what a
safe migration must account for. Unlike generic dependency update or QA tools,
Evergreen is deterministic, evidence-backed, and local-first.

### Promise

**Know what breaks next.**

Evergreen turns lifecycle risk into inspectable migration context before that
risk becomes an outage, blocked build, or emergency upgrade.

The promise has four non-negotiable parts:

1. **Local-first:** repository analysis runs on the user's machine or CI runner.
   Evergreen has no hosted analysis backend and does not upload repository
   contents.
2. **Evidence-backed:** every deprecation claim cites an authoritative source.
   Evergreen reports an explicit limitation instead of guessing.
3. **Repository-specific:** findings identify the affected declaration, files,
   usages, and migration impact rather than repeating ecosystem-wide news.
4. **Safe handoff:** versioned machine-readable contracts give humans and coding
   agents the same constraints, evidence, migration steps, and verification
   direction. Evergreen never changes production code or executes suggested
   project commands automatically.

## Audience hierarchy

The ranking controls product examples, documentation order, and campaign focus.

### Primary audiences

1. **Maintainers of long-lived open-source and shared repositories** — people
   accountable for compatibility who need early, credible warnings without a
   new hosted service.
2. **Platform engineering and developer-experience teams** — teams that need a
   repeatable lifecycle policy across many repositories, CI visibility, and
   structured outputs for automation.

### Secondary audiences

3. **Developers operating production repositories** — engineers planning or
   performing upgrades who need exact affected usages and safe verification
   guidance.
4. **Coding-agent builders and operators** — people integrating deterministic
   lifecycle evidence into agents through MCP, the Agent Skill, the CLI, or JSON
   contracts. The agent is a delivery surface; the accountable human remains the
   audience.

Package vendors, general consumers, and teams seeking vulnerability management
are not priority audiences for the current product.

## Brand character

### Attributes

- **Precise:** exact paths, lines, versions, dates, and sources over vague alerts.
- **Calm:** early guidance and proportionate severity over fear-based urgency.
- **Trustworthy:** inspectable evidence and explicit limits over opaque claims.
- **Technical:** speaks naturally to maintainers and infrastructure teams without
  performing expertise.
- **Durable:** favors stable contracts, restrained design, and long-lived language.
- **Agent-ready:** structured for automation while keeping human accountability
  visible.

### Anti-attributes

Evergreen must never feel speculative, alarmist, magical, autonomous, invasive,
surveillance-oriented, playful at the expense of clarity, or like a generic
AI-branded SaaS product. Avoid green leaf and tree clichés, neon AI gradients,
anthropomorphic agent language, and claims that a migration is safe without
verification.

## Voice and writing

The voice is concise, factual, calm, and direct. Lead with the observed lifecycle
change and repository impact, then show evidence and the next safe action.

### Voice rules

- Prefer concrete verbs: `scan`, `explain`, `locate`, `compare`, and `verify`.
- Distinguish facts, estimates, recommendations, and unknowns.
- Name authoritative sources and dates when they affect urgency.
- Say `Evergreen found` or `Evergreen reports`, never `Evergreen thinks`.
- Say `migration context` or `migration packet`, not `AI fix`.
- Use `local-first` only with the concrete privacy boundary nearby.
- Use sentence case for headings, controls, and documentation titles.
- Write in English for official product surfaces. Community translations may
  localize prose but keep product and interface names unchanged.

### Message pattern

Use this order whenever space allows:

1. lifecycle fact;
2. affected repository declaration or usage;
3. authoritative evidence;
4. migration direction;
5. verification boundary.

Example: “`actions/checkout@v4` is affected by an upcoming runtime removal. Two
workflow files use it. Review the linked GitHub announcement, update the pinned
major version, and run the suggested workflow checks. Evergreen does not execute
those checks automatically.”

## Naming architecture

`Evergreen` is the master product and project name. Do not expand it into an
acronym or attach `AI` to the name.

| Surface | Approved name | Notes |
| --- | --- | --- |
| Product/project | **Evergreen** | First mention is simply “Evergreen.” |
| npm package | `evergreen-deprecation` | Registry identifier; not the display name. |
| Command-line interface | **Evergreen CLI** | Commands remain `evergreen ...`. |
| Local agent server | **Evergreen MCP server** | Command remains `evergreen-mcp`. |
| CI integration | **Evergreen GitHub Action** | Use the full name on first mention. |
| Portable instructions | **Evergreen Agent Skill** | Singular; use “Agent Skill” as the format name. |
| Ecosystem rules | **Evergreen detectors** | Use a qualifier when useful, such as “Python detector.” |
| Structured handoff | **Evergreen migration packet** | Lowercase generic noun after the product name. |

Avoid standalone variants such as `Evergreen AI`, `Evergreen Cloud`, `Evergreen
Scanner`, or `Evergreen Bot` unless a future approved product architecture defines
them. Integrations extend the same local engine; they are not separate products.

## Tagline and descriptor

### Primary tagline

**Know what breaks next.**

Use it on the website hero, launch graphics, repository social image, and quiet
brand moments. Preserve the wording, sentence case, and period. Do not add
“before it breaks” or replace `breaks` with softer language; the contrast between
the direct verb and the calm system is intentional.

### Product descriptor

**Local-first deprecation intelligence for software repositories.**

Use the descriptor where the audience needs immediate category clarity: package
metadata, repository introductions, directories, and first-use documentation.
The tagline may accompany it, but it must not replace the descriptor in technical
contexts.

### Supporting message

**Evidence-backed migration context for humans and coding agents.**

Use this only when explaining the human/agent handoff. It is not a second tagline.

## Typography

The type system should feel contemporary and infrastructure-grade without looking
militarized or futuristic.

### Primary sans

Use **Inter Variable** for wordmarks, headlines, body copy, navigation, and UI.
Approved weights are 400, 500, 600, and 700. Use the system fallback stack when
the font cannot be bundled:

```css
font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

The live-type wordmark is uppercase `EVERGREEN`, weight 700, with restrained
positive tracking of approximately `0.08em`. Convert it to outlines only for
locked production artwork; keep an editable source version.

### Technical mono

Use **IBM Plex Mono** for commands, versions, paths, evidence IDs, labels, and
small technical accents. Approved weights are 400 and 500. Fallback stack:

```css
font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
```

Do not use monospaced type for long prose or large marketing headlines. Do not
introduce a display face until the product needs a distinct editorial layer.

## Visual continuity

The approved `Version Notches` mark, palette, and construction rules live in
[`brand/README.md`](README.md). The rings express major, minor, and patch lifecycle
layers; the staggered notches express distinct lifecycle boundaries. Verified Green
is reserved for functional success states and must not become the primary brand
color merely because the product is named Evergreen.

## Non-goals and claim boundaries

Evergreen is not:

- a generic dependency update notifier;
- a vulnerability or malware scanner;
- a hosted repository dashboard;
- an autonomous migration agent;
- a package manager, Dependabot, or Renovate replacement;
- a guarantee that a migration is safe without project-specific verification.

Do not use claims such as “never break again,” “automatic safe upgrades,” “zero
risk,” “complete ecosystem coverage,” or “AI-powered fixes.”

## Versioning and governance

This brief uses semantic versioning:

- **Patch:** clarification with no change to approved meaning or usage.
- **Minor:** additive guidance, audience examples, or a new named surface.
- **Major:** a change to positioning, promise, audience priority, master name,
  tagline, or core claim boundary.

Changes require a pull request or issue that records the reason and affected
surfaces. Product behavior and evidence take precedence over marketing language;
claims must be corrected when the implementation no longer supports them.

### Revision history

| Version | Date | Change |
| --- | --- | --- |
| `1.0.0` | 2026-10-14 | Approved positioning, audience hierarchy, voice, naming, tagline, typography, and claim boundaries. |
