import { spawn } from "node:child_process";

import { testProcessArgs } from "../dist/tools/check-pipeline.js";

const child = spawn(process.execPath, testProcessArgs(), { stdio: "inherit" });
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
