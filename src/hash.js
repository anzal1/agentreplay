import { createHash, randomUUID } from "node:crypto";

export function createTraceId() {
  return `tr_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

export function sha256(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)])
    );
  }

  return value;
}
