#!/usr/bin/env node
import { resolve } from "node:path";
import { runCrmPilot } from "./demo.js";

const traceDir = process.argv.includes("--write-traces")
  ? resolve("traces/crm-pilot")
  : undefined;

const result = await runCrmPilot({ traceDir });
console.log(JSON.stringify(result, null, 2));
