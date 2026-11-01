---
title: "Is your repo affected? @angular/core v20 reaches end of life on 2026-11-28"
---

# Is your repo affected? @angular/core v20 reaches end of life on 2026-11-28

Angular's release schedule lists **v20** as LTS with "LTS ends **2026-11-28**". LTS receives only critical fixes and security patches until that date. Applications still on the 20.x line lose those fixes afterwards.

## Who is affected

Angular projects whose `package.json` pins `@angular/core` to the 20 release line (`>=20.0.0` and `<21.0.0`), and files that import from `@angular/core`. The `npm` detector reports those declarations and usages.

## Check your repository

```bash
npx evergreen-deprecation scan
```

Look for rule `npm.package.angular.core.v20.scheduled-end-of-life`. You can also check the package directly:

```bash
npx evergreen-deprecation check pkg:npm/%40angular/core@20
```

## Migration steps

Replacement: `@angular/core@22`.

1. **Update to Angular v21.** Run `ng update @angular/core@21 @angular/cli@21`, then apply the v21 steps in the Angular Update Guide, including the required TypeScript and Node.js versions.
2. **Update to Angular v22.** After the v21 build and tests pass, run `ng update @angular/core@22 @angular/cli@22` and apply the v22 steps in the Angular Update Guide.
3. **Review changed Angular APIs.** Check each reported `@angular/core` import against the Angular Update Guide for removed, renamed, or changed APIs.

Then verify with `npm ls @angular/core`, `npm run build --if-present`, and `npm run test --if-present`. Full constraints and verification commands are on the [rule page](../rules/npm.package.angular.core.v20.scheduled-end-of-life.md).

## Sources

- [Angular release and support schedule](https://angular.dev/reference/releases)
- [Angular Update Guide](https://angular.dev/update-guide)
- Rule: [`npm.package.angular.core.v20.scheduled-end-of-life`](../rules/npm.package.angular.core.v20.scheduled-end-of-life.md)

Every claim above comes from the linked sources and the reviewed rule. The [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
