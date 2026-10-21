# Vue lifecycle fixtures

These fixtures exercise the Vue lifecycle rules in [`registry/npm.json`](../../../registry/npm.json). Vue is an npm package, so the bundled `npm` detector reads them: `package.json` declares `vue`, and `package-lock.json` resolves it. Line numbers below are 1-based.

The rule covers Vue 2 only (`vers:npm/>=2.0.0|<3.0.0`, `npm.package.vue.eol-2`). Its deadline, 2023-12-31, comes from the [Vue 2 LTS, EOL & Extended Support](https://v2.vuejs.org/lts/) page. Vue 3 is a supported major, so it has no lifecycle rule and produces no finding. Vue 0.x and 1.x are not covered because no reviewed source states their status.

| Fixture | Expected case |
| --- | --- |
| `positive/package.json` | `dependencies.vue` `^2.7.16` (line 5) is a Vue 2 declaration. `vue-template-compiler` (line 8) has no rule of its own and adds no finding. |
| `positive/package-lock.json` | `node_modules/vue` resolves to `2.7.16`, so the finding's summary names that version. |
| `positive/src/main.js` | `import Vue from "vue"` (line 1) is the usage the finding lists, and the migration packet names this file. |
| `negative/package.json` | `vue` `^3.5.13` is a supported major. `@vue/compat`, `vue-router`, and `@vue/cli-service` are lookalike packages with no Vue 2 rule. |
| `negative/src/main.js` | A comment (line 1) and a string (line 5) mention Vue 2 and `@vue/compat` but are not imports. |
| `zero/package.json` | `vue` `^3.5.13` with Vite tooling: a supported Vue 3 project with no lifecycle finding. |
| `zero/package-lock.json` | `node_modules/vue` resolves to `3.5.13`. |
| `zero/src/main.js` | `createApp` from `vue`: valid Vue 3 usage, no finding. |

Not covered by these fixtures: a Vue 2 declaration in a workspace, Vue 2 declared through a package other than `vue` (for example `vue-template-compiler` on its own), and any form the npm detector already skips, such as a declared `workspace:*` range. Those follow the npm detector's own rules.
