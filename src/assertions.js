export function toolEvents(trace) {
  return trace.events.filter((event) => event.type === "tool_call");
}

export function firstToolIndex(trace, tool) {
  return toolEvents(trace).findIndex((event) => event.tool === tool);
}

export function getPath(value, path) {
  return path.split(".").reduce((current, segment) => {
    if (current == null) {
      return undefined;
    }

    return current[segment];
  }, value);
}

const assertionHandlers = {
  tool_called(trace, assertion) {
    const passed = firstToolIndex(trace, assertion.tool) !== -1;
    return result(assertion, passed, `${assertion.tool} was not called`);
  },

  tool_not_called(trace, assertion) {
    const passed = firstToolIndex(trace, assertion.tool) === -1;
    return result(assertion, passed, `${assertion.tool} was called`);
  },

  requires_approval(trace, assertion) {
    const offenders = toolEvents(trace).filter((event) => {
      if (event.tool !== assertion.tool) {
        return false;
      }

      return event.approval?.status !== "approved";
    });

    return result(
      assertion,
      offenders.length === 0,
      `${assertion.tool} ran ${offenders.length} time(s) without approval`
    );
  },

  tool_order(trace, assertion) {
    const before = firstToolIndex(trace, assertion.before);
    const after = firstToolIndex(trace, assertion.after);
    const passed = before !== -1 && after !== -1 && before < after;
    return result(
      assertion,
      passed,
      `${assertion.before} must run before ${assertion.after}`
    );
  },

  arg_equals(trace, assertion) {
    const events = toolEvents(trace).filter((event) => event.tool === assertion.tool);
    const passed = events.some((event) => getPath(event.args, assertion.path) === assertion.value);
    return result(
      assertion,
      passed,
      `${assertion.tool}.${assertion.path} did not equal ${JSON.stringify(assertion.value)}`
    );
  },

  arg_matches(trace, assertion) {
    const pattern = new RegExp(assertion.pattern, assertion.flags ?? "i");
    const events = toolEvents(trace).filter((event) => event.tool === assertion.tool);
    const passed = events.some((event) => pattern.test(String(getPath(event.args, assertion.path) ?? "")));
    return result(
      assertion,
      passed,
      `${assertion.tool}.${assertion.path} did not match ${assertion.pattern}`
    );
  },

  arg_not_matches(trace, assertion) {
    const pattern = new RegExp(assertion.pattern, assertion.flags ?? "i");
    const offenders = toolEvents(trace).filter((event) => {
      if (event.tool !== assertion.tool) {
        return false;
      }

      return pattern.test(String(getPath(event.args, assertion.path) ?? ""));
    });
    return result(
      assertion,
      offenders.length === 0,
      `${assertion.tool}.${assertion.path} matched forbidden pattern ${assertion.pattern}`
    );
  },

  response_equals(trace, assertion) {
    const events = toolEvents(trace).filter((event) => event.tool === assertion.tool);
    const passed = events.some((event) => getPath(event.response, assertion.path) === assertion.value);
    return result(
      assertion,
      passed,
      `${assertion.tool}.response.${assertion.path} did not equal ${JSON.stringify(assertion.value)}`
    );
  },

  max_tool_calls(trace, assertion) {
    const count = assertion.tool
      ? toolEvents(trace).filter((event) => event.tool === assertion.tool).length
      : toolEvents(trace).length;
    const passed = count <= assertion.max;
    return result(assertion, passed, `Expected at most ${assertion.max} call(s), got ${count}`);
  },

  side_effect_exists(trace, assertion) {
    const events = toolEvents(trace).filter((event) => event.tool === assertion.tool);
    const passed = events.some((event) =>
      (event.sideEffects ?? []).some((sideEffect) => sideEffect.type === assertion.sideEffectType)
    );
    return result(
      assertion,
      passed,
      `${assertion.tool} did not record side effect ${assertion.sideEffectType}`
    );
  },

  side_effect_count(trace, assertion) {
    const count = toolEvents(trace)
      .filter((event) => !assertion.tool || event.tool === assertion.tool)
      .flatMap((event) => event.sideEffects ?? [])
      .filter((sideEffect) => !assertion.sideEffectType || sideEffect.type === assertion.sideEffectType)
      .length;
    const passed = compareCount(count, assertion.operator ?? "eq", assertion.count);
    return result(
      assertion,
      passed,
      `Expected ${assertion.sideEffectType ?? "side effect"} count ${assertion.operator ?? "eq"} ${assertion.count}, got ${count}`
    );
  },

  no_replay_mismatches(trace, assertion) {
    const passed = (trace.replayMismatches ?? []).length === 0;
    return result(
      assertion,
      passed,
      `Replay had ${trace.replayMismatches?.length ?? 0} mismatch(es)`
    );
  },

  redaction_applied(trace, assertion) {
    const { expectedOutcome, ...tracePayload } = trace;
    const serialized = JSON.stringify(tracePayload);
    const passed = !assertion.patterns.some((pattern) => new RegExp(pattern, "i").test(serialized));
    return result(assertion, passed, "Trace contains data matching a forbidden redaction pattern");
  }
};

export function evaluateAssertions(trace, assertions = trace.expectedOutcome?.assertions ?? []) {
  return assertions.map((assertion) => {
    const handler = assertionHandlers[assertion.type];
    if (!handler) {
      return result(assertion, false, `Unsupported assertion type: ${assertion.type}`);
    }

    return handler(trace, assertion);
  });
}

export function assertionSummary(results) {
  const failed = results.filter((check) => !check.passed);

  return {
    passed: failed.length === 0,
    total: results.length,
    failed: failed.length,
    results
  };
}

function result(assertion, passed, fallbackMessage) {
  return {
    name: assertion.name ?? assertion.type,
    type: assertion.type,
    passed,
    message: passed ? assertion.passMessage ?? "passed" : assertion.message ?? fallbackMessage
  };
}

function compareCount(actual, operator, expected) {
  if (operator === "eq") return actual === expected;
  if (operator === "neq") return actual !== expected;
  if (operator === "gt") return actual > expected;
  if (operator === "gte") return actual >= expected;
  if (operator === "lt") return actual < expected;
  if (operator === "lte") return actual <= expected;
  return false;
}
