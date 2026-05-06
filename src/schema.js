import { sha256 } from "./hash.js";

const requiredTraceFields = [
  "schemaVersion",
  "traceId",
  "project",
  "agent",
  "startedAt",
  "endedAt",
  "events"
];

const allowedEventTypes = new Set(["user_input", "tool_call", "final_output", "note"]);

export const allowedAssertionTypes = new Set([
  "tool_called",
  "tool_not_called",
  "requires_approval",
  "tool_order",
  "arg_equals",
  "arg_matches",
  "arg_not_matches",
  "response_equals",
  "max_tool_calls",
  "side_effect_exists",
  "side_effect_count",
  "no_replay_mismatches",
  "redaction_applied"
]);

const assertionRequiredFields = {
  tool_called: ["tool"],
  tool_not_called: ["tool"],
  requires_approval: ["tool"],
  tool_order: ["before", "after"],
  arg_equals: ["tool", "path", "value"],
  arg_matches: ["tool", "path", "pattern"],
  arg_not_matches: ["tool", "path", "pattern"],
  response_equals: ["tool", "path", "value"],
  max_tool_calls: ["max"],
  side_effect_exists: ["tool", "sideEffectType"],
  side_effect_count: ["count"],
  no_replay_mismatches: [],
  redaction_applied: ["patterns"]
};

export function validateTrace(trace) {
  const errors = [];

  if (!trace || typeof trace !== "object") {
    return {
      valid: false,
      errors: ["Trace must be an object"]
    };
  }

  for (const field of requiredTraceFields) {
    if (!(field in trace)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (trace.schemaVersion !== "agentreplay.trace.v1") {
    errors.push(`Unsupported schemaVersion: ${trace.schemaVersion}`);
  }

  if ("traceId" in trace && typeof trace.traceId !== "string") {
    errors.push("traceId must be a string");
  }

  if ("project" in trace && typeof trace.project !== "string") {
    errors.push("project must be a string");
  }

  if ("agent" in trace && (!trace.agent || typeof trace.agent !== "object" || Array.isArray(trace.agent))) {
    errors.push("agent must be an object");
  }

  if ("toolManifest" in trace && !Array.isArray(trace.toolManifest)) {
    errors.push("toolManifest must be an array");
  }

  if ("replayMismatches" in trace && !Array.isArray(trace.replayMismatches)) {
    errors.push("replayMismatches must be an array");
  }

  if (!Array.isArray(trace.events)) {
    errors.push("events must be an array");
  } else {
    const ids = new Set();

    trace.events.forEach((event, index) => {
      if (!event.id) {
        errors.push(`events[${index}] missing id`);
      } else if (ids.has(event.id)) {
        errors.push(`events[${index}] duplicate id: ${event.id}`);
      } else {
        ids.add(event.id);
      }

      if (!event.type || !allowedEventTypes.has(event.type)) {
        errors.push(`events[${index}] has unsupported type: ${event.type}`);
      }

      if (!event.ts) {
        errors.push(`events[${index}] missing ts`);
      }

      if (event.type === "tool_call") {
        for (const field of ["tool", "args", "argHash", "responseHash"]) {
          if (!(field in event)) {
            errors.push(`events[${index}] tool_call missing ${field}`);
          }
        }

        if ("tool" in event && typeof event.tool !== "string") {
          errors.push(`events[${index}] tool must be a string`);
        }

        if ("args" in event && (!event.args || typeof event.args !== "object" || Array.isArray(event.args))) {
          errors.push(`events[${index}] args must be an object`);
        }

        if ("argHash" in event && typeof event.argHash !== "string") {
          errors.push(`events[${index}] argHash must be a string`);
        }

        if ("responseHash" in event && typeof event.responseHash !== "string") {
          errors.push(`events[${index}] responseHash must be a string`);
        }

        if ("sideEffects" in event && !Array.isArray(event.sideEffects)) {
          errors.push(`events[${index}] sideEffects must be an array`);
        }

        if ("args" in event && "argHash" in event && sha256(event.args) !== event.argHash) {
          errors.push(`events[${index}] argHash does not match args`);
        }

        if (
          "responseHash" in event &&
          sha256(event.response ?? null) !== event.responseHash
        ) {
          errors.push(`events[${index}] responseHash does not match response`);
        }
      }
    });
  }

  validateAssertions(trace.expectedOutcome?.assertions, errors);

  return {
    valid: errors.length === 0,
    errors
  };
}

export function traceStats(trace) {
  const toolCalls = trace.events.filter((event) => event.type === "tool_call");
  const sideEffects = toolCalls.flatMap((event) => event.sideEffects ?? []);
  const approvals = toolCalls.filter((event) => event.approval);

  return {
    events: trace.events.length,
    toolCalls: toolCalls.length,
    sideEffects: sideEffects.length,
    approvals: approvals.length,
    tools: [...new Set(toolCalls.map((event) => event.tool))]
  };
}

function validateAssertions(assertions, errors) {
  if (assertions === undefined) {
    return;
  }

  if (!Array.isArray(assertions)) {
    errors.push("expectedOutcome.assertions must be an array");
    return;
  }

  assertions.forEach((assertion, index) => {
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      errors.push(`expectedOutcome.assertions[${index}] must be an object`);
      return;
    }

    if (!allowedAssertionTypes.has(assertion.type)) {
      errors.push(`expectedOutcome.assertions[${index}] unsupported type: ${assertion.type}`);
      return;
    }

    for (const field of assertionRequiredFields[assertion.type]) {
      if (!(field in assertion)) {
        errors.push(`expectedOutcome.assertions[${index}] ${assertion.type} missing ${field}`);
      }
    }

    if (assertion.type === "redaction_applied" && !Array.isArray(assertion.patterns)) {
      errors.push(`expectedOutcome.assertions[${index}] patterns must be an array`);
    }

    if (assertion.type === "max_tool_calls" && typeof assertion.max !== "number") {
      errors.push(`expectedOutcome.assertions[${index}] max must be a number`);
    }

    if (assertion.type === "side_effect_count" && typeof assertion.count !== "number") {
      errors.push(`expectedOutcome.assertions[${index}] count must be a number`);
    }

    if (["arg_matches", "arg_not_matches"].includes(assertion.type)) {
      try {
        new RegExp(assertion.pattern, assertion.flags ?? "i");
      } catch {
        errors.push(`expectedOutcome.assertions[${index}] pattern must be a valid regular expression`);
      }
    }
  });
}
