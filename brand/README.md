# Evergreen brand assets

This directory contains Evergreen's production `Version Notches` identity,
brand guidance, reusable templates, and canonical exports.

The versioned positioning, audience, voice, naming, tagline, and typography rules
are defined in [`BRAND_BRIEF.md`](BRAND_BRIEF.md). Practical logo, color,
accessibility, layout, template, and export rules are in
[`BRAND_GUIDE.md`](BRAND_GUIDE.md).

## Mark construction

- Canvas: `256 × 256`
- Center: `(128, 128)`
- Ring radii: `96`, `70`, and `44`
- Stroke width: `18`
- Notches: one stroke-width square at 12, 3, and 6 o'clock

The three rings represent major, minor, and patch lifecycle layers. Their small,
separate notches distinguish the mark from an open `C` and create a precise,
recognizable lifecycle signal without an additional symbol.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| Carbon | `#0C1110` | Dark canvas and monochrome mark |
| Deep Mineral | `#17211E` | Deep supporting surface |
| Forest Slate | `#23423A` | Outer brand ring |
| Mineral Green | `#4C7C6D` | Middle brand ring and accent |
| Mist Green | `#9AC7B6` | Inner brand ring and light accent |
| Frost | `#F3F6F4` | Light canvas and dark-mode text |
| Verified Green | `#2F7D5B` | Functional success states only |

## Files

- `assets/evergreen-mark-dark.svg` — color mark for dark surfaces
- `assets/evergreen-mark-light.svg` — color mark for light surfaces
- `assets/evergreen-mark-mono.svg` — single-color dark mark
- `assets/evergreen-mark-mono-light.svg` — single-color light mark
- Matching `512 × 512` transparent PNG exports for each mark variant
- `evergreen-logo-sheet.svg` — review sheet with lockups and small-size checks
- `templates/` — editable social, avatar, banner, and marketplace sources
- `exports/` — canonical PNG renders of every template preset
- `tokens.json` and `tokens.css` — machine-readable design tokens
- `export-presets.json` — canonical source, output, size, and background mappings

The wordmark on the review sheet is still live type so typography can be selected
and edited. It follows the approved Inter typography and uses IBM Plex Mono for
the tagline. Before the final release, convert the approved wordmark to outlines.

## Preliminary similarity review

The original open-concentric-ring concept was intentionally not adopted unchanged:
broken concentric rings are common in technology and identity systems. The selected
mark adds a fixed three-notch pattern at 12, 3, and 6 o'clock and uses a
documented major/minor/patch construction grid.

This is a preliminary obvious-confusion review, not legal trademark clearance.
Before a v1 brand launch, repeat image-similarity searches on the final outlined
lockup and obtain jurisdiction-specific trademark advice if registration is planned.

## Asset rights

Evergreen source code remains under Apache License 2.0. The Evergreen name, logo,
wordmark, templates, and other brand assets are proprietary and are not licensed
under Apache 2.0. Limited permission for unmodified, truthful references to the
official project is described in [`LICENSE.md`](LICENSE.md).
