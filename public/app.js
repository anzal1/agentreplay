const traceList = document.querySelector("#traceList");
const traceDetail = document.querySelector("#traceDetail");
const emptyState = document.querySelector("#emptyState");
const refresh = document.querySelector("#refresh");

let selectedId = null;

refresh.addEventListener("click", loadTraces);
await loadTraces();

async function loadTraces() {
  const traces = await fetchJson("/api/traces");
  traceList.innerHTML = "";

  for (const trace of traces) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `trace-row ${trace.traceId === selectedId ? "active" : ""}`;
    button.innerHTML = `
      <span class="badge ${trace.gatePassed ? "pass" : "fail"}">${trace.gatePassed ? "PASS" : "FAIL"}</span>
      <span class="trace-id">${escapeHtml(trace.traceId)}</span>
      <span class="meta">${escapeHtml(trace.project)} / ${escapeHtml(trace.agent)} / ${trace.stats.toolCalls} tools</span>
    `;
    button.addEventListener("click", () => selectTrace(trace.traceId));
    traceList.append(button);
  }

  if (!traces.length) {
    traceList.innerHTML = `<div class="meta" style="padding:14px">No traces found. Run <code>agentreplay demo</code>.</div>`;
  }
}

async function selectTrace(traceId) {
  selectedId = traceId;
  await loadTraces();

  const [trace, gate, validation] = await Promise.all([
    fetchJson(`/api/trace?id=${encodeURIComponent(traceId)}`),
    fetchJson(`/api/gate?id=${encodeURIComponent(traceId)}`),
    fetchJson(`/api/validate?id=${encodeURIComponent(traceId)}`)
  ]);
  const tools = trace.events.filter((event) => event.type === "tool_call");

  emptyState.classList.add("hidden");
  traceDetail.classList.remove("hidden");
  traceDetail.innerHTML = `
    <h2>${escapeHtml(trace.project)} / ${escapeHtml(trace.agent?.name ?? "unknown")}</h2>
    <div class="summary">
      <div class="metric">Trace <strong>${escapeHtml(trace.traceId)}</strong></div>
      <div class="metric">Gate <strong>${gate.passed ? "passed" : "failed"}</strong></div>
      <div class="metric">Schema <strong>${validation.valid ? "valid" : "invalid"}</strong></div>
      <div class="metric">Tools <strong>${tools.length}</strong></div>
      <div class="metric">Side effects <strong>${tools.flatMap((tool) => tool.sideEffects ?? []).length}</strong></div>
    </div>

    <div class="section-title">Assertions</div>
    ${gate.results.map(renderCheck).join("")}

    <div class="section-title">Tool Calls</div>
    ${tools.map(renderTool).join("")}

    <div class="section-title">Tool Manifest</div>
    <pre>${escapeHtml(JSON.stringify(trace.toolManifest ?? [], null, 2))}</pre>
  `;
}

function renderCheck(check) {
  return `
    <div class="check">
      <span class="badge ${check.passed ? "pass" : "fail"}">${check.passed ? "PASS" : "FAIL"}</span>
      <strong>${escapeHtml(check.name)}</strong>
      <span class="meta">${escapeHtml(check.message)}</span>
    </div>
  `;
}

function renderTool(tool, index) {
  return `
    <div class="tool">
      <strong>${index + 1}. ${escapeHtml(tool.tool)}</strong>
      <pre>${escapeHtml(JSON.stringify({
        args: tool.args,
        response: tool.response,
        sideEffects: tool.sideEffects ?? [],
        replay: tool.replay
      }, null, 2))}</pre>
    </div>
  `;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
