# Landscape Sources

This is a lightweight landscape note, not a full market map.

## Existing adjacent products

- [Regres.ai](https://regres.ai/) describes regression testing, production auditing, and replay/compare workflows for AI decisions.
- [Laminar](https://laminar.sh/docs/) describes observability for AI agents and replay from captured traces.
- [Tracewire](https://tracewire.dev/) describes open-source LLM observability, prompt traces, and replay from trace points.
- [Omium](https://omium.ai/) describes time-travel replay for production AI-agent workflows.
- [Decyra](https://www.decyra.ai/) describes AI-agent decision replay and auditing.

## Research signals

- [AgentRR: LLM Agents with Record & Replay](https://arxiv.org/abs/2505.17716) proposes record/replay for LLM agents.
- [AgentAssay](https://arxiv.org/abs/2603.02601) discusses regression testing for non-deterministic AI-agent workflows and trace-first offline analysis.
- [Reasoning Provenance for Autonomous AI Agents](https://arxiv.org/abs/2603.21692) distinguishes execution traces from richer behavioral/provenance records.

## Product conclusion

The broad replay idea is not empty. The better wedge is deterministic side-effect regression for tool-using agents, where state snapshots, diffable side effects, approval invariants, redaction, and CI gates are first-class.
