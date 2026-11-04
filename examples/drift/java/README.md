# Java drift example

This repository compiles and ships on Java 17, but its `.java-version` asks for Java 21. `evergreen drift` reports the disagreement and names the exact file and line of each value.

```bash
npm run build
node dist/tools/examples.js drift/java drift --runtime java
node dist/tools/examples.js drift/java drift --runtime java --align 21   # print a patch that makes the file agree
```

The example is committed with scanner-neutral names, so the command copies it to a temporary directory and restores the real names before running. The patch is printed, never written. Apply it yourself after reviewing it.
