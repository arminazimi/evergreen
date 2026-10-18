# Evergreen brand guide

Version `1.0.0` · English-only · Dark-first

This guide turns the Evergreen strategy into reusable rules for product,
documentation, repository, social, and marketplace surfaces. For positioning,
audiences, voice, and naming, see [`BRAND_BRIEF.md`](BRAND_BRIEF.md).

## Core identity

**Product name:** Evergreen  
**Tagline:** Know what breaks next.  
**Descriptor:** Local-first deprecation intelligence for software repositories.

Use the tagline for expressive brand moments and the descriptor when category
clarity matters. Do not replace the product name with `Evergreen AI`, `Evergreen
Scanner`, or another unofficial variant.

## Logo system

The `Version Notches` mark represents major, minor, and patch lifecycle layers.
Its staggered openings turn version boundaries into a compact lifecycle signal.

### Approved variants

| Context | Asset |
| --- | --- |
| Dark brand surface | `assets/evergreen-mark-dark.svg` |
| Light brand surface | `assets/evergreen-mark-light.svg` |
| One-color dark reproduction | `assets/evergreen-mark-mono.svg` |
| One-color light reproduction | `assets/evergreen-mark-mono-light.svg` |

Use SVG for editable or scalable work. Use the committed PNG exports where a
platform requires raster images.

### Clear space

Keep clear space equal to one eighth of the mark width (`12.5%`) on every side.
For a 256 px mark, this is 32 px. No text, frame, crop, or unrelated graphic may
enter that area. The source assets already contain the minimum internal margin;
preserve an equivalent external margin when placing them in a composition.

### Minimum size

- Full-color mark: 32 px wide on screen or 8 mm in print.
- Monochrome mark: 24 px wide on screen or 6 mm in print.
- Wordmark lockup: 120 px wide on screen or 30 mm in print.
- At 16 px, use the monochrome mark only, keep it pixel-aligned, and do not pair
  it with the wordmark or tagline.

### Correct use

- Preserve the exact geometry, proportions, and staggered notches.
- Use an approved color variant with sufficient contrast.
- Scale uniformly from the center.
- Prefer generous negative space and a quiet surrounding composition.
- Use the symbol alone for avatars, favicons, badges, and small UI locations.

### Incorrect use

- Do not rotate, skew, stretch, crop, outline, or add shadows to the mark.
- Do not recolor individual rings outside the approved variants.
- Do not fill the rings, close the notches, add a node, or animate the geometry
  as a loading spinner.
- Do not place the color mark on photography, gradients, or low-contrast colors.
- Do not put the tagline inside the clear-space boundary.
- Do not use a leaf, tree, shield, target, or generic AI sparkle as an alternate
  Evergreen symbol.

## Color

The canonical machine-readable values live in [`tokens.json`](tokens.json), with
CSS custom properties in [`tokens.css`](tokens.css).

| Token | Value | Role |
| --- | --- | --- |
| Carbon | `#0C1110` | Primary dark canvas and dark mark |
| Deep Mineral | `#17211E` | Elevated dark surface |
| Forest Slate | `#23423A` | Outer brand ring and primary accent |
| Mineral Green | `#4C7C6D` | Middle brand ring |
| Mist Green | `#9AC7B6` | Inner brand ring and light accent |
| Frost | `#F3F6F4` | Primary light canvas and dark-mode text |
| Verified Green | `#2F7D5B` | Functional success only |

Verified Green is not a general brand accent. It communicates a successful or
verified state and must retain that semantic meaning.

### Accessible color pairs

Ratios use WCAG relative luminance. `AA` below means normal text at 4.5:1 or
better; `AA Large` means large text at 3:1 or better.

| Foreground | Background | Ratio | Approved use |
| --- | --- | ---: | --- |
| Frost | Carbon | 17.49:1 | AA text and UI |
| Frost | Deep Mineral | 15.16:1 | AA text and UI |
| Frost | Forest Slate | 10.09:1 | AA text and UI |
| Mist Green | Carbon | 10.17:1 | AA text and UI |
| Carbon | Frost | 17.49:1 | AA text and UI |
| Forest Slate | Frost | 10.09:1 | AA text and UI |
| Mineral Green | Frost | 4.38:1 | AA Large only |

Do not use a pair below 3:1 for meaningful graphics or interface boundaries. Do
not use a pair below 4.5:1 for normal text. Never communicate status with color
alone; pair it with a label, icon, or structural change.

## Typography

Use **Inter Variable** for the wordmark, headings, body copy, navigation, and UI.
Use weights 400, 500, 600, and 700. The live wordmark is uppercase, weight 700,
with approximately `0.08em` positive tracking.

Use **IBM Plex Mono** at weights 400 and 500 for commands, paths, versions,
finding IDs, metadata, and small technical labels. Do not use monospace for long
body copy or large marketing headlines.

Fallback stacks are defined in [`tokens.css`](tokens.css). Templates use common
fallbacks so the source remains editable without bundled font files; committed
PNG exports are the canonical rendered output.

## Spacing and shape

Use the 4 px base spacing scale from `tokens.json`. Prefer the 16, 24, 32, 48,
and 64 px steps for layouts. Keep presentation grids sparse: one primary message,
one supporting line, and one technical detail per panel.

Use 8 px radius for compact UI, 16 px for cards, and 24 px for presentation
panels. The logo itself must not receive a container shape unless the platform
requires an avatar or badge.

## Templates and exports

Editable sources live in [`templates/`](templates/) and canonical raster exports
live in [`exports/`](exports/). Dimensions and source/output mappings are recorded
in [`export-presets.json`](export-presets.json).

| Template | Dimensions | Purpose |
| --- | ---: | --- |
| Social preview | 1280 × 640 | GitHub repository and social sharing |
| Avatar | 512 × 512 | Repository, community, and profile icon |
| Banner | 1500 × 500 | Documentation, launch, and directory headers |
| Marketplace feature | 965 × 482 | GitHub Marketplace feature-card background |
| Marketplace logo | 512 × 512 | Transparent square logo source |

GitHub recommends 1280 × 640 for best repository social-preview display and a
solid background when transparency is uncertain. GitHub Marketplace recommends a
transparent square logo of at least 200 × 200 and specifies 965 × 482 for feature
card backgrounds. Source references:

- [GitHub repository social preview guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)
- [GitHub Marketplace logo and feature-card guidance](https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/writing-a-listing-description-for-your-app#logo-and-feature-card)

Marketplace feature images intentionally contain no wordmark or tagline because
GitHub overlays the listing name and logo. Use `#F3F6F4` as text color on the
dark feature background and `#0C1110` on the light alternative.

## Asset rights

Evergreen code remains available under Apache License 2.0. The Evergreen name,
logo, and brand assets are not licensed under Apache 2.0. See
[`LICENSE.md`](LICENSE.md) for the limited brand-use permission.

## Release checklist

- Use the approved product name, tagline, and descriptor.
- Select the correct dark, light, or monochrome logo.
- Preserve clear space and minimum size.
- Verify all meaningful text and UI pairs against the contrast table.
- Export at the exact preset dimensions and inspect the result at 100%.
- Confirm that no personal attribution is present in public templates.
- Confirm that English is the only language in official brand assets.
- Keep editable SVG and canonical PNG outputs in sync.
- Re-check current platform specifications before uploading externally.

