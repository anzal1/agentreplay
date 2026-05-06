package main

import (
	"os"

	"agentreplay-go-sdk/agentreplay"
)

func main() {
	output := os.Args[1]
	harness := agentreplay.NewHarness(
		"conformance",
		map[string]any{"name": "go-sdk", "language": "go"},
		"tr_go_conformance",
		"2026-01-01T00:00:00.000Z",
	)
	harness.RecordInput(map[string]any{"message": "update a CRM lead", "email": "person@example.com"})
	harness.RecordToolCall(
		"crm.updateLead",
		map[string]any{"leadId": "lead_1", "email": "person@example.com", "token": "secret-token"},
		map[string]any{"ok": true, "email": "person@example.com"},
		map[string]any{"status": "approved", "by": "policy.crm_write"},
		map[string]any{"lead_1": map[string]any{"status": "open"}},
		map[string]any{"lead_1": map[string]any{"status": "qualified"}},
		[]map[string]any{{"type": "crm.lead.updated", "leadId": "lead_1"}},
		1,
	)
	harness.RecordFinalOutput(map[string]any{"status": "done"})
	err := harness.Save(output, map[string]any{
		"assertions": []any{
			map[string]any{"type": "tool_called", "tool": "crm.updateLead"},
			map[string]any{"type": "requires_approval", "tool": "crm.updateLead"},
			map[string]any{"type": "side_effect_count", "tool": "crm.updateLead", "sideEffectType": "crm.lead.updated", "count": 1},
			map[string]any{"type": "redaction_applied", "patterns": []any{"person@example\\.com", "secret-token"}},
		},
	}, nil)
	if err != nil {
		panic(err)
	}
}
