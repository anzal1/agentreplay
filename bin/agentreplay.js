#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertionSummary,
  diffTraces,
  evaluateAssertions,
  FileTraceStore,
  traceStats,
  validateTrace
} from "../src/index.js";
import { createAgentReplayServer, listen } from "../src/server/server.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);
const store = new FileTraceStore({ rootDir: resolve(rootDir, "traces") });

try {
  if (!command || command === "help" || command === "--help") {
    printHelp();
  } else if (command === "inspect") {
    await inspect(args);
  } else if (command === "list") {
    await list(args);
  } else if (command === "validate") {
    await validate(args);
  } else if (command === "gate") {
    await gate(args);
  } else if (command === "diff") {
    await diff(args);
  } else if (command === "freeze") {
    await freeze(args);
  } else if (command === "init") {
    await init(args);
  } else if (command === "serve") {
    await serve(args);
  } else if (command === "demo") {
    await demo(args);
  } else {
    fail(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

async function inspect(rawArgs) {
  const { args, json } = parseArgs(rawArgs);
  const trace = await loadTrace(required(args[0], "trace path"));
  const tools = trace.events.filter((event) => event.type === "tool_call");
  const final = trace.events.findLast((event) => event.type === "final_output");
  const stats = traceStats(trace);
  const result = {
    traceId: trace.traceId,
    project: trace.project,
    agent: trace.agent ?? {},
    stats,
    tools: tools.map((event) => ({
      id: event.id,
      tool: event.tool,
      args: event.args,
      sideEffects: event.sideEffects ?? []
    })),
    finalOutput: final?.output
  };

  if (json) {
    printJson(result);
    return;
  }

  console.log(`Trace: ${trace.traceId}`);
  console.log(`Project: ${trace.project}`);
  console.log(`Agent: ${trace.agent?.name ?? "unknown"}`);
  console.log(`Tool calls: ${tools.length}`);
  console.log(`Side effects: ${stats.sideEffects}`);
  console.log(`Tools: ${stats.tools.join(", ")}`);
  tools.forEach((event, index) => {
    console.log(`${index + 1}. ${event.tool} ${JSON.stringify(event.args)}`);
  });

  if (final) {
    console.log(`Final: ${JSON.stringify(final.output)}`);
  }
}

async function list(rawArgs = []) {
  const { json } = parseArgs(rawArgs);
  const traces = await store.list();

  if (json) {
    printJson(traces);
    return;
  }

  for (const trace of traces) {
    console.log(
      `${trace.gatePassed ? "PASS" : "FAIL"} ${trace.traceId} ${trace.project} ${trace.agent} tools=${trace.stats.toolCalls} file=${trace.file}`
    );
  }
}

async function validate(rawArgs) {
  const { args, json } = parseArgs(rawArgs);
  const trace = await loadTrace(required(args[0], "trace path"));
  const validation = validateTrace(trace);
  const result = {
    traceId: trace.traceId,
    ...validation
  };

  if (json) {
    printJson(result);
    if (!validation.valid) {
      process.exitCode = 1;
    }
    return;
  }

  if (validation.valid) {
    console.log(`VALID ${trace.traceId}`);
    return;
  }

  validation.errors.forEach((error) => console.log(`INVALID ${error}`));
  process.exitCode = 1;
}

async function gate(rawArgs) {
  const { args, json } = parseArgs(rawArgs);
  const trace = await loadTrace(required(args[0], "trace path"));
  const summary = assertionSummary(evaluateAssertions(trace));
  const result = {
    traceId: trace.traceId,
    project: trace.project,
    passed: summary.passed,
    total: summary.total,
    failed: summary.failed,
    results: summary.results
  };

  if (json) {
    printJson(result);
  } else {
    printGate(summary);
  }

  if (!summary.passed) {
    process.exitCode = 1;
  }
}

async function diff(rawArgs) {
  const { args, json } = parseArgs(rawArgs);
  const left = await loadTrace(required(args[0], "left trace path"));
  const right = await loadTrace(required(args[1], "right trace path"));
  const result = diffTraces(left, right);
  const output = {
    leftTraceId: left.traceId,
    rightTraceId: right.traceId,
    ...result
  };

  if (json) {
    printJson(output);
    return;
  }

  if (!result.changed) {
    console.log("No tool, args, or side-effect changes.");
    return;
  }

  for (const change of result.changes) {
    console.log(`${change.type} @ ${change.index}: ${JSON.stringify(change)}`);
  }
}

async function freeze(rawArgs) {
  const { args, json } = parseArgs(rawArgs);
  const trace = await loadTrace(required(args[0], "trace path"));
  const filePath = await store.save(trace);

  if (json) {
    printJson({ traceId: trace.traceId, filePath });
    return;
  }

  console.log(`Frozen ${trace.traceId} at ${filePath}`);
}

async function init(rawArgs = []) {
  const { args, json } = parseArgs(rawArgs);
  const targetDir = resolve(args.find((arg) => !arg.startsWith("--")) ?? ".");
  const force = args.includes("--force");
  const files = [
    {
      path: resolve(targetDir, "traces/gates/.gitkeep"),
      content: ""
    },
    {
      path: resolve(targetDir, "traces/incidents/.gitkeep"),
      content: ""
    },
    {
      path: resolve(targetDir, "traces/README.md"),
      content: `# AgentReplay traces

Put release-blocking traces in \`traces/gates\`.

Suggested flow:

1. Save production failures or adversarial fixtures as \`agentreplay.trace.v1\` JSON.
2. Validate traces with \`agentreplay validate <trace.json> --json\`.
3. Gate release-critical traces with \`agentreplay gate <trace.json> --json\`.
4. Keep exploratory or failing incident captures under \`traces/incidents\` until they are fixed.
`
    },
    {
      path: resolve(targetDir, ".github/workflows/agentreplay.yml"),
      content: `name: AgentReplay

on:
  pull_request:
  push:
    branches: [main]

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Validate and gate traces
        shell: bash
        run: |
          shopt -s nullglob
          traces=(traces/gates/*.json)
          if [ \${#traces[@]} -eq 0 ]; then
            echo "No release-gate traces found in traces/gates"
            exit 0
          fi
          for trace in "\${traces[@]}"; do
            npx --yes --package @anzalabidi/agentreplay agentreplay validate "$trace" --json
            npx --yes --package @anzalabidi/agentreplay agentreplay gate "$trace" --json
          done
`
    }
  ];
  const written = [];
  const skipped = [];

  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    try {
      await writeFile(file.path, file.content, { flag: force ? "w" : "wx" });
      written.push(file.path);
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      skipped.push(file.path);
    }
  }

  const result = { targetDir, written, skipped };
  if (json) {
    printJson(result);
    return;
  }

  written.forEach((file) => console.log(`created ${file}`));
  skipped.forEach((file) => console.log(`exists  ${file}`));
  if (skipped.length && !force) {
    console.log("Use --force to overwrite existing files.");
  }
}

async function serve(rawArgs) {
  const { args } = parseArgs(rawArgs);
  const port = Number(readOption(args, "--port", "4177"));
  const server = createAgentReplayServer({ rootDir, traceDir: resolve(rootDir, "traces") });
  const bound = await listen(server, { port });
  console.log(`AgentReplay console: ${bound.url}`);
}

async function demo(rawArgs = []) {
  const { json } = parseArgs(rawArgs);
  const demoUrl = pathToFileURL(resolve(rootDir, "examples/billing-agent/demo.js")).href;
  const { runDemo } = await import(demoUrl);
  const result = await runDemo({
    badTracePath: resolve(rootDir, "traces/billing-bad-run.json"),
    fixedTracePath: resolve(rootDir, "traces/billing-fixed-run.json")
  });

  if (json) {
    printJson(result);
    await writeLatestDemoResult(result);
    return;
  }

  console.log(`Recorded bad run: ${result.badTracePath}`);
  console.log(`Recorded fixed run: ${result.fixedTracePath}`);
  console.log("\nGate on bad run:");
  printGate(result.badGate);
  console.log("\nGate on fixed run:");
  printGate(result.fixedGate);
  console.log("\nDiff:");
  result.diff.changes.forEach((change) => {
    console.log(`${change.type} @ ${change.index}: ${JSON.stringify(change)}`);
  });

  await writeLatestDemoResult(result);
}

async function loadTrace(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

function printGate(summary) {
  for (const check of summary.results) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.message}`);
  }

  console.log(`${summary.passed ? "PASSED" : "FAILED"} ${summary.total - summary.failed}/${summary.total}`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`AgentReplay

Usage:
  agentreplay demo [--json]
  agentreplay list [--json]
  agentreplay inspect <trace.json> [--json]
  agentreplay validate <trace.json> [--json]
  agentreplay gate <trace.json> [--json]
  agentreplay diff <left-trace.json> <right-trace.json> [--json]
  agentreplay freeze <trace.json> [--json]
  agentreplay init [directory] [--force] [--json]
  agentreplay serve [--port 4177]
`);
}

function required(value, label) {
  if (!value) {
    fail(`Missing ${label}`);
  }

  return value;
}

function fail(message) {
  throw new Error(message);
}

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
}

function parseArgs(args) {
  return {
    json: args.includes("--json"),
    args: args.filter((arg) => arg !== "--json")
  };
}

async function writeLatestDemoResult(result) {
  await writeFile(
    resolve(rootDir, "traces/latest-demo-result.json"),
    `${JSON.stringify(result, null, 2)}\n`
  );
}
