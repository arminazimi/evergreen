# React Native fixtures

These fixtures exercise the React Native lifecycle rule in `registry/npm.json`. The lifecycle status comes from the [React Native Releases Working Group support policy](https://github.com/reactwg/react-native-releases/blob/main/docs/support.md) and its linked [release schedule](https://reactnative.dev/releases/overview).

At the time of review, React Native 0.77.x through 0.84.x are Unsupported, 0.85.x is End of Cycle, and 0.86.x and 0.87.x are Active. The per-series coverage is tested in `tests/react-native.test.ts`.

| Fixture | Expected case |
| --- | --- |
| `positive` | `react-native` 0.84.0 is unsupported; the finding includes `src/App.tsx` as a usage. |
| `zero` | `react-native` 0.87.1 is active and produces no finding. |
| `negative` | A floating `latest` declaration and similarly named packages produce no finding. |
| `malformed` | An invalid declaration and malformed lockfile produce no finding or error. |
