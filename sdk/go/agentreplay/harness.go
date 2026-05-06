package agentreplay

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"
)

var defaultKeyPattern = regexp.MustCompile(`(?i)^(token|secret|password|authorization|apikey|api_key|email|to|from|cc|bcc)$`)
var defaultEmailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

type Harness struct {
	Project      string
	Agent        map[string]any
	TraceID      string
	StartedAt    string
	Events       []map[string]any
	ToolManifest []map[string]any
	Redact       func(any) any
}

func NewHarness(project string, agent map[string]any, traceID string, startedAt string) *Harness {
	if traceID == "" {
		traceID = "tr_go_conformance"
	}
	if startedAt == "" {
		startedAt = now()
	}
	return &Harness{
		Project:      project,
		Agent:        agent,
		TraceID:      traceID,
		StartedAt:    startedAt,
		Events:       []map[string]any{},
		ToolManifest: []map[string]any{},
		Redact:       DefaultRedactor,
	}
}

func (h *Harness) RecordInput(input any) {
	h.Events = append(h.Events, stripNil(map[string]any{
		"id":    eventID(len(h.Events)),
		"type":  "user_input",
		"ts":    now(),
		"input": h.Redact(input),
	}))
}

func (h *Harness) RecordToolCall(tool string, args map[string]any, response any, approval map[string]any, preState any, postState any, sideEffects []map[string]any, durationMs int) {
	safeArgs := h.Redact(args)
	safeResponse := h.Redact(response)
	h.Events = append(h.Events, stripNil(map[string]any{
		"id":           eventID(len(h.Events)),
		"type":         "tool_call",
		"ts":           now(),
		"tool":         tool,
		"args":         safeArgs,
		"argHash":      SHA256(safeArgs),
		"response":     safeResponse,
		"responseHash": SHA256(safeResponse),
		"approval":     redactOptional(h.Redact, approval),
		"preState":     redactOptional(h.Redact, preState),
		"postState":    redactOptional(h.Redact, postState),
		"sideEffects":  h.Redact(sideEffects),
		"durationMs":   durationMs,
	}))
}

func (h *Harness) RecordFinalOutput(output any) {
	h.Events = append(h.Events, stripNil(map[string]any{
		"id":     eventID(len(h.Events)),
		"type":   "final_output",
		"ts":     now(),
		"output": h.Redact(output),
	}))
}

func (h *Harness) Finalize(expectedOutcome map[string]any, metadata map[string]any) map[string]any {
	return stripNil(map[string]any{
		"schemaVersion":    "agentreplay.trace.v1",
		"traceId":          h.TraceID,
		"project":          h.Project,
		"agent":            h.Agent,
		"startedAt":        h.StartedAt,
		"endedAt":          now(),
		"replayMismatches": []any{},
		"toolManifest":     h.ToolManifest,
		"events":           h.Events,
		"expectedOutcome":  expectedOutcome,
		"metadata":         metadata,
	})
}

func (h *Harness) Save(path string, expectedOutcome map[string]any, metadata map[string]any) error {
	trace := h.Finalize(expectedOutcome, metadata)
	bytes, err := json.MarshalIndent(trace, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, append(bytes, '\n'), 0644)
}

func DefaultRedactor(value any) any {
	switch typed := value.(type) {
	case string:
		if defaultEmailPattern.MatchString(typed) {
			return "[REDACTED]"
		}
		return typed
	case []map[string]any:
		out := make([]map[string]any, len(typed))
		for i, item := range typed {
			out[i] = DefaultRedactor(item).(map[string]any)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = DefaultRedactor(item)
		}
		return out
	case map[string]any:
		out := map[string]any{}
		for key, item := range typed {
			if defaultKeyPattern.MatchString(key) {
				out[key] = "[REDACTED]"
			} else {
				out[key] = DefaultRedactor(item)
			}
		}
		return out
	default:
		return value
	}
}

func SHA256(value any) string {
	sum := sha256.Sum256([]byte(StableStringify(value)))
	return hex.EncodeToString(sum[:])
}

func StableStringify(value any) string {
	bytes, _ := json.Marshal(sortJSON(value))
	return string(bytes)
}

func sortJSON(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		out := map[string]any{}
		for _, key := range keys {
			out[key] = sortJSON(typed[key])
		}
		return out
	case []map[string]any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = sortJSON(item)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = sortJSON(item)
		}
		return out
	default:
		return value
	}
}

func stripNil(value map[string]any) map[string]any {
	out := map[string]any{}
	for key, item := range value {
		if item != nil {
			out[key] = item
		}
	}
	return out
}

func redactOptional(redact func(any) any, value any) any {
	if value == nil {
		return nil
	}
	return redact(value)
}

func now() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

func eventID(index int) string {
	return "evt_" + leftPad(index+1, 4)
}

func leftPad(value int, width int) string {
	text := "0000000000" + itoa(value)
	return text[len(text)-width:]
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}
