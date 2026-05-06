import copy
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_KEY_RE = re.compile(r"^(token|secret|password|authorization|apikey|api_key|email|to|from|cc|bcc)$", re.I)
DEFAULT_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def stable_stringify(value):
    return json.dumps(_sort_json(value), separators=(",", ":"), ensure_ascii=False)


def sha256(value):
    return hashlib.sha256(stable_stringify(value).encode("utf-8")).hexdigest()


def create_redactor(keys=None, patterns=None, replacement="[REDACTED]"):
    key_patterns = [DEFAULT_KEY_RE]
    key_patterns.extend(_to_key_pattern(key) for key in (keys or []))
    value_patterns = [DEFAULT_EMAIL_RE]
    value_patterns.extend(_to_value_pattern(pattern) for pattern in (patterns or []))

    def redact(value):
        return _redact_value(value, key_patterns, value_patterns, replacement)

    return redact


default_redactor = create_redactor()


class AgentReplayHarness:
    def __init__(self, project="default", agent=None, trace_id=None, started_at=None, tool_manifest=None, redact=None):
        self.project = project
        self.agent = agent or {}
        self.trace_id = trace_id or f"tr_{uuid.uuid4().hex[:20]}"
        self.started_at = started_at or _now()
        self.events = []
        self.tool_manifest = copy.deepcopy(tool_manifest or [])
        self.redact = redact or default_redactor

    def record_input(self, input_value):
        self.events.append(_strip_none({
            "id": _event_id(len(self.events)),
            "type": "user_input",
            "ts": _now(),
            "input": self.redact(copy.deepcopy(input_value)),
        }))

    def record_tool_call(self, tool, args=None, response=None, approval=None, pre_state=None, post_state=None, side_effects=None, duration_ms=0):
        safe_args = self.redact(copy.deepcopy(args or {}))
        safe_response = self.redact(copy.deepcopy(response))
        event = {
            "id": _event_id(len(self.events)),
            "type": "tool_call",
            "ts": _now(),
            "tool": tool,
            "args": safe_args,
            "argHash": sha256(safe_args),
            "response": safe_response,
            "responseHash": sha256(safe_response if safe_response is not None else None),
            "approval": self.redact(copy.deepcopy(approval)) if approval else None,
            "preState": self.redact(copy.deepcopy(pre_state)) if pre_state is not None else None,
            "postState": self.redact(copy.deepcopy(post_state)) if post_state is not None else None,
            "sideEffects": self.redact(copy.deepcopy(side_effects or [])),
            "durationMs": duration_ms,
        }
        self.events.append(_strip_none(event))

    def record_final_output(self, output):
        self.events.append(_strip_none({
            "id": _event_id(len(self.events)),
            "type": "final_output",
            "ts": _now(),
            "output": self.redact(copy.deepcopy(output)),
        }))

    def finalize(self, expected_outcome=None, metadata=None):
        return _strip_none({
            "schemaVersion": "agentreplay.trace.v1",
            "traceId": self.trace_id,
            "project": self.project,
            "agent": self.agent,
            "startedAt": self.started_at,
            "endedAt": _now(),
            "replayMismatches": [],
            "toolManifest": self.tool_manifest,
            "events": self.events,
            "expectedOutcome": expected_outcome,
            "metadata": metadata,
        })

    def save(self, path, **kwargs):
        trace = self.finalize(**kwargs)
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(trace, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return trace


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _event_id(index):
    return f"evt_{index + 1:04d}"


def _sort_json(value):
    if isinstance(value, list):
        return [_sort_json(item) for item in value]
    if isinstance(value, dict):
        return {key: _sort_json(value[key]) for key in sorted(value)}
    return value


def _strip_none(value):
    if isinstance(value, list):
        return [_strip_none(item) for item in value]
    if isinstance(value, dict):
        return {key: _strip_none(item) for key, item in value.items() if item is not None}
    return value


def _redact_value(value, key_patterns, value_patterns, replacement):
    if isinstance(value, str):
        return replacement if any(pattern.search(value) for pattern in value_patterns) else value
    if isinstance(value, list):
        return [_redact_value(item, key_patterns, value_patterns, replacement) for item in value]
    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            if any(pattern.search(key) for pattern in key_patterns):
                redacted[key] = replacement
            else:
                redacted[key] = _redact_value(item, key_patterns, value_patterns, replacement)
        return redacted
    return value


def _to_key_pattern(value):
    return value if hasattr(value, "search") else re.compile(f"^{re.escape(str(value))}$", re.I)


def _to_value_pattern(value):
    return value if hasattr(value, "search") else re.compile(str(value), re.I)
