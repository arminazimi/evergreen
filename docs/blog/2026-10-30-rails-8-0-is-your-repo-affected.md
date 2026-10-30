---
title: "Is your repo affected? Rails 8.0 security support ends 2026-11-07"
---

# Is your repo affected? Rails 8.0 security support ends 2026-11-07

The Rails maintenance policy says **Rails 8.0.x** receives security fixes until **2026-11-07**. After that date, 8.0.x is past the security window. Rails 8.1.x is the newer supported release series.

## Who is affected

Ruby applications whose `Gemfile` / `Gemfile.lock` pin `rails` (or the Rails framework gems) to the 8.0 release series (`>=8.0.0` and `<8.1.0`). The `ruby` detector reports those lockfile and Gemfile declarations.

## Check your repository

```bash
npx evergreen-deprecation scan
```

Look for rule `ruby.gem.rails-8.0.scheduled-end-of-life`. To check a Package URL:

```bash
npx evergreen-deprecation check pkg:gem/rails@8.0
```

## Migration steps

Replacement: Rails 8.1.x.

1. **Upgrade Rails to 8.1.** Set Rails to the latest 8.1 patch in the Gemfile and run `bundle update rails` so every `Gemfile.lock` matches that series.
2. **Apply the Rails 8.1 upgrade section.** Follow the official 8.0-to-8.1 guide and resolve each listed behavior change before enabling the Rails 8.1 framework defaults.
3. **Review the Rails 8.1 defaults.** Run `bin/rails app:update`, review generated changes, enable new framework defaults gradually, and update `config.load_defaults` only when ready.

Verify with `bundle check`, `bin/rails test`, and `bin/rails runner 'puts Rails.version'`. Full constraints are on the [rule page](../rules/ruby.gem.rails-8.0.scheduled-end-of-life.md).

## Sources

- [Ruby on Rails maintenance policy](https://rubyonrails.org/maintenance)
- [Upgrading Ruby on Rails](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html)
- Rule: [`ruby.gem.rails-8.0.scheduled-end-of-life`](../rules/ruby.gem.rails-8.0.scheduled-end-of-life.md)

Every claim above comes from the linked sources and the reviewed rule. The [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
