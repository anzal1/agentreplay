import { AgentReplayHarness } from "../harness.js";
import { assertionSummary, evaluateAssertions } from "../assertions.js";
import { diffTraces } from "../diff.js";

export async function replayTrace({ sourceTrace, runAgent, project, agent }) {
  const harness = new AgentReplayHarness({
    mode: "replay",
    trace: sourceTrace,
    project: project ?? sourceTrace.project,
    agent: agent ?? sourceTrace.agent
  });

  const userInput = sourceTrace.events.find((event) => event.type === "user_input")?.input;
  harness.recordInput(userInput);
  const finalOutput = await runAgent({ harness, input: userInput, sourceTrace });

  harness.recordFinalOutput(finalOutput);

  const replayedTrace = harness.finalize({
    expectedOutcome: sourceTrace.expectedOutcome,
    metadata: {
      replayedFrom: sourceTrace.traceId
    }
  });
  const gateAssertions = [
    ...(sourceTrace.expectedOutcome?.assertions ?? []),
    {
      type: "no_replay_mismatches",
      name: "replay_matches_source"
    }
  ];

  return {
    sourceTrace,
    replayedTrace,
    gate: assertionSummary(evaluateAssertions(replayedTrace, gateAssertions)),
    diff: diffTraces(sourceTrace, replayedTrace)
  };
}
