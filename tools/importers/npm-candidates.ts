/**
 * npm packages the `npm-deprecated` importer checks. npm exposes a deprecation flag per package but no
 * list of deprecated packages, so a maintainer or contributor adds the packages worth watching here.
 *
 * Add the exact name as it appears in a `package.json` dependency (case matters for old packages).
 * Packages that are not deprecated at their latest version produce no rule, so the importer lists them
 * in its notes and they can be removed. Keep the list sorted.
 */
export const NPM_CANDIDATES: readonly string[] = [
  "@hapi/joi",
  "babel-eslint",
  "babel-preset-es2015",
  "boom",
  "cryptiles",
  "gulp-util",
  "har-validator",
  "inflight",
  "istanbul",
  "jade",
  "karma-phantomjs-launcher",
  "left-pad",
  "natives",
  "node-pre-gyp",
  "node-sass",
  "nomnom",
  "popper.js",
  "protractor",
  "querystring",
  "request",
  "request-promise",
  "request-promise-native",
  "rollup-plugin-babel",
  "sntp",
  "tslint",
  "uglify-es",
];
