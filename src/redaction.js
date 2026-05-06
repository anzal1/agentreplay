const defaultKeyMatchers = [
  /^(token|secret|password|authorization|apikey|api_key|email|to|from|cc|bcc)$/i
];

const defaultValueMatchers = [/^[^\s@]+@[^\s@]+\.[^\s@]+$/];

export const defaultRedactor = createRedactor();

export function createRedactor(options = {}) {
  const replacement = options.replacement ?? "[REDACTED]";
  const keyMatchers = [
    ...defaultKeyMatchers,
    ...(options.keys ?? []).map(toMatcher)
  ];
  const valueMatchers = [
    ...defaultValueMatchers,
    ...(options.patterns ?? []).map(toMatcher)
  ];

  return function redact(value) {
    return redactValue(value, { keyMatchers, valueMatchers, replacement });
  };
}

function redactValue(value, options) {
  if (typeof value === "string") {
    return options.valueMatchers.some((matcher) => matcher.test(value))
      ? options.replacement
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((nested) => redactValue(nested, options));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        if (options.keyMatchers.some((matcher) => matcher.test(key))) {
          return [key, options.replacement];
        }

        return [key, redactValue(nested, options)];
      })
    );
  }

  return value;
}

function toMatcher(value) {
  if (value instanceof RegExp) {
    return value;
  }

  return new RegExp(`^${escapeRegExp(String(value))}$`, "i");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
