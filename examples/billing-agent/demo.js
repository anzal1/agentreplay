import { assertionSummary, evaluateAssertions, AgentReplayHarness, diffTraces } from "../../src/index.js";

const input = {
  message: "Refund Acme for the duplicate invoice and let Sarah know."
};

const expectedOutcome = {
  assertions: [
    {
      type: "tool_order",
      name: "refund_before_crm_update",
      before: "stripe.refund",
      after: "hubspot.updateDeal",
      message: "CRM should only be updated after the refund succeeds."
    },
    {
      type: "tool_not_called",
      name: "never_send_email_without_approval",
      tool: "gmail.send",
      message: "Email must be drafted unless explicit approval exists."
    },
    {
      type: "tool_called",
      name: "draft_customer_email",
      tool: "gmail.draft",
      message: "Customer email should be drafted for approval."
    },
    {
      type: "arg_equals",
      name: "refund_duplicate_invoice",
      tool: "stripe.refund",
      path: "invoiceId",
      value: "in_acme_duplicate",
      message: "Refund should target Acme's duplicate invoice."
    },
    {
      type: "side_effect_exists",
      name: "refund_records_side_effect",
      tool: "stripe.refund",
      sideEffectType: "invoice_refunded",
      message: "Refund tool should record a concrete invoice side effect."
    },
    {
      type: "redaction_applied",
      name: "emails_redacted",
      patterns: ["sarah@acme\\.example", "ap\\.sarah@acme\\.example"],
      message: "Trace should not leak raw customer email addresses."
    }
  ]
};

export async function runDemo(paths = {}) {
  const bad = await runScenario({ agentName: "billing-agent-buggy", implementation: buggyBillingAgent });
  const fixed = await runScenario({ agentName: "billing-agent-fixed", implementation: fixedBillingAgent });

  if (paths.badTracePath) {
    await bad.harness.save(paths.badTracePath, { expectedOutcome });
  }

  if (paths.fixedTracePath) {
    await fixed.harness.save(paths.fixedTracePath, { expectedOutcome });
  }

  const badTrace = bad.harness.finalize({ expectedOutcome });
  const fixedTrace = fixed.harness.finalize({ expectedOutcome });

  return {
    badTracePath: paths.badTracePath,
    fixedTracePath: paths.fixedTracePath,
    badGate: assertionSummary(evaluateAssertions(badTrace)),
    fixedGate: assertionSummary(evaluateAssertions(fixedTrace)),
    diff: diffTraces(badTrace, fixedTrace)
  };
}

async function runScenario({ agentName, implementation }) {
  const state = createBillingState();
  const harness = new AgentReplayHarness({
    project: "billing-ops",
    agent: {
      name: agentName,
      model: "demo-model",
      promptHash: "demo"
    }
  });
  const tools = createTools(harness, state);

  harness.recordInput(input);
  const output = await implementation(input, tools);
  harness.recordFinalOutput(output);

  return { harness, state, output };
}

function createTools(harness, state) {
  return {
    searchInvoices: harness.wrapTool("stripe.searchInvoices", async ({ customer }) => {
      return state.invoices.filter((invoice) => invoice.customer === customer);
    }),

    refund: harness.wrapTool(
      "stripe.refund",
      async ({ invoiceId, amount }) => {
        const invoice = state.invoices.find((candidate) => candidate.id === invoiceId);
        if (!invoice) {
          throw new Error(`Invoice not found: ${invoiceId}`);
        }

        invoice.status = "refunded";
        invoice.refundedAmount = amount;

        return {
          refundId: `re_${invoiceId}`,
          invoiceId,
          amount,
          status: "succeeded"
        };
      },
      {
        description: "Refund a paid Stripe invoice.",
        inputSchema: {
          type: "object",
          required: ["invoiceId", "amount"],
          properties: {
            invoiceId: { type: "string" },
            amount: { type: "number" }
          }
        },
        snapshot: () => state.invoices.map((invoice) => ({ ...invoice })),
        diff: (before, after, args) => [
          {
            type: "invoice_refunded",
            invoiceId: args.invoiceId,
            before: before.find((invoice) => invoice.id === args.invoiceId),
            after: after.find((invoice) => invoice.id === args.invoiceId)
          }
        ]
      }
    ),

    updateDeal: harness.wrapTool(
      "hubspot.updateDeal",
      async ({ customer, note }) => {
        state.crm[customer] = { note, updatedAt: "demo-clock" };
        return { customer, status: "updated" };
      },
      {
        snapshot: () => ({ ...state.crm })
      }
    ),

    sendEmail: harness.wrapTool("gmail.send", async ({ to, subject, body }) => {
      state.sentEmails.push({ to, subject, body });
      return { id: `sent_${state.sentEmails.length}`, status: "sent" };
    }),

    draftEmail: harness.wrapTool("gmail.draft", async ({ to, subject, body }) => {
      state.drafts.push({ to, subject, body });
      return { id: `draft_${state.drafts.length}`, status: "drafted" };
    })
  };
}

async function buggyBillingAgent(_input, tools) {
  const invoices = await tools.searchInvoices({ customer: "Acme" });
  const wrongInvoice = invoices.find((invoice) => invoice.contactName === "Sarah");

  await tools.refund({
    invoiceId: wrongInvoice.id,
    amount: wrongInvoice.amount
  });
  await tools.updateDeal({
    customer: "Acme",
    note: `Refunded ${wrongInvoice.id}`
  });
  await tools.sendEmail({
    to: wrongInvoice.contactEmail,
    subject: "Refund processed",
    body: "The duplicate invoice has been refunded."
  });

  return {
    status: "done",
    message: `Refunded ${wrongInvoice.id} and emailed Sarah.`
  };
}

async function fixedBillingAgent(_input, tools) {
  const invoices = await tools.searchInvoices({ customer: "Acme" });
  const duplicateInvoice = invoices.find((invoice) => invoice.duplicateOf);

  await tools.refund({
    invoiceId: duplicateInvoice.id,
    amount: duplicateInvoice.amount
  });
  await tools.updateDeal({
    customer: "Acme",
    note: `Refunded duplicate invoice ${duplicateInvoice.id}`
  });
  await tools.draftEmail({
    to: duplicateInvoice.contactEmail,
    subject: "Refund ready for review",
    body: "The duplicate invoice refund has been prepared. Please review before sending."
  });

  return {
    status: "needs_approval",
    message: `Refunded ${duplicateInvoice.id} and drafted email.`
  };
}

function createBillingState() {
  return {
    invoices: [
      {
        id: "in_acme_original",
        customer: "Acme",
        contactName: "Sarah",
        contactEmail: "sarah@acme.example",
        amount: 12000,
        status: "paid"
      },
      {
        id: "in_acme_duplicate",
        customer: "Acme",
        contactName: "Sarah",
        contactEmail: "ap.sarah@acme.example",
        amount: 12000,
        status: "paid",
        duplicateOf: "in_acme_original"
      }
    ],
    crm: {},
    sentEmails: [],
    drafts: []
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runDemo({
    badTracePath: new URL("../../traces/billing-bad-run.json", import.meta.url).pathname,
    fixedTracePath: new URL("../../traces/billing-fixed-run.json", import.meta.url).pathname
  });

  console.log(JSON.stringify(result, null, 2));
}
