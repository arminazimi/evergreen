import type { Capability } from "../schema.js";

const environmentDoctor: Capability = {
  id: "environment.doctor",
  status: "supported",
  version: "1",
  description: "Diagnose local and CI prerequisites without changing configuration.",
  ecosystems: [],
};

export default environmentDoctor;
