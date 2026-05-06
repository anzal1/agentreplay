import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agentreplay import AgentReplayHarness


def main():
    output = Path(sys.argv[1])
    harness = AgentReplayHarness(
        project="conformance",
        agent={"name": "python-sdk", "language": "python"},
        trace_id="tr_python_conformance",
        started_at="2026-01-01T00:00:00.000Z",
    )
    harness.record_input({"message": "update a CRM lead", "email": "person@example.com"})
    harness.record_tool_call(
        "crm.updateLead",
        args={"leadId": "lead_1", "email": "person@example.com", "token": "secret-token"},
        response={"ok": True, "email": "person@example.com"},
        approval={"status": "approved", "by": "policy.crm_write"},
        pre_state={"lead_1": {"status": "open"}},
        post_state={"lead_1": {"status": "qualified"}},
        side_effects=[{"type": "crm.lead.updated", "leadId": "lead_1"}],
        duration_ms=1,
    )
    harness.record_final_output({"status": "done"})
    harness.save(
        output,
        expected_outcome={
            "assertions": [
                {"type": "tool_called", "tool": "crm.updateLead"},
                {"type": "requires_approval", "tool": "crm.updateLead"},
                {"type": "side_effect_count", "tool": "crm.updateLead", "sideEffectType": "crm.lead.updated", "count": 1},
                {"type": "redaction_applied", "patterns": ["person@example\\.com", "secret-token"]},
            ]
        },
    )


if __name__ == "__main__":
    main()
