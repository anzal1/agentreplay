import { stableStringify } from "./hash.js";

export function diffTraces(left, right) {
  const leftTools = left.events.filter((event) => event.type === "tool_call");
  const rightTools = right.events.filter((event) => event.type === "tool_call");
  const max = Math.max(leftTools.length, rightTools.length);
  const changes = [];

  for (let index = 0; index < max; index += 1) {
    const before = leftTools[index];
    const after = rightTools[index];

    if (!before) {
      changes.push({
        type: "tool_added",
        index,
        tool: after.tool,
        args: after.args
      });
      continue;
    }

    if (!after) {
      changes.push({
        type: "tool_removed",
        index,
        tool: before.tool,
        args: before.args
      });
      continue;
    }

    if (before.tool !== after.tool) {
      changes.push({
        type: "tool_changed",
        index,
        before: before.tool,
        after: after.tool
      });
    }

    if (stableStringify(before.args) !== stableStringify(after.args)) {
      changes.push({
        type: "args_changed",
        index,
        tool: after.tool,
        before: before.args,
        after: after.args
      });
    }

    if (stableStringify(before.sideEffects ?? []) !== stableStringify(after.sideEffects ?? [])) {
      changes.push({
        type: "side_effects_changed",
        index,
        tool: after.tool,
        before: before.sideEffects ?? [],
        after: after.sideEffects ?? []
      });
    }
  }

  return {
    leftTraceId: left.traceId,
    rightTraceId: right.traceId,
    changed: changes.length > 0,
    changes
  };
}
