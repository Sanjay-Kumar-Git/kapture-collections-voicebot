const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const DEMO_ACCOUNT = {
  accountId: "ACC-88392",
  customerName: "Rahul Sharma",
  loanType: "Personal Loan",
  overdueAmount: 8499,
  dpd: 12,
  verificationValues: new Set(["1234", "1995"])
};

// Short-lived in-memory auth tokens for the demo.
// Production: use a signed, short-lived token bound to the call/session.
const authTokens = new Map();
const dispositions = [];
const ptps = [];

function issueAuthToken(accountId) {
  const token = crypto.randomBytes(24).toString("hex");
  authTokens.set(token, {
    accountId,
    expiresAt: Date.now() + 15 * 60 * 1000
  });
  return token;
}

function validateAuthToken(token, accountId) {
  if (!token) return false;
  const record = authTokens.get(token);
  if (!record) return false;
  if (record.expiresAt < Date.now()) {
    authTokens.delete(token);
    return false;
  }
  return record.accountId === accountId;
}

function parseArguments(toolCall) {
  let args = toolCall?.function?.arguments ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  return args || {};
}

function result(toolCallId, value) {
  return {
    results: [
      {
        toolCallId,
        result: JSON.stringify(value)
      }
    ]
  };
}

function safeLogArgs(args) {
  // Never log verification values or auth tokens.
  const copy = { ...args };
  delete copy.verification_code;
  delete copy.auth_token;
  return copy;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "kapture-mock-webhook" });
});

app.post("/webhook", (req, res) => {
  const message = req.body?.message;

  if (!message || message.type !== "tool-calls") {
    return res.status(200).json({ status: "acknowledged" });
  }

  const toolCall =
  message.toolCallList?.[0] ??
  message.toolCalls?.[0];

if (!toolCall) {
  return res.status(400).json({ error: "Missing tool call" });
}

const name =
  toolCall.name ??
  toolCall.function?.name;

const rawArguments =
  toolCall.arguments ??
  toolCall.function?.arguments ??
  {};

const args =
  typeof rawArguments === "string"
    ? (() => {
        try {
          return JSON.parse(rawArguments);
        } catch {
          return {};
        }
      })()
    : rawArguments;

  console.log(`[tool] ${name}`, safeLogArgs(args));

  let output;

  switch (name) {
    case "verify_customer": {
      const code = String(args.verification_code ?? "");
      const verified =
        args.account_id === DEMO_ACCOUNT.accountId &&
        DEMO_ACCOUNT.verificationValues.has(code);

      if (verified) {
        const authToken = issueAuthToken(DEMO_ACCOUNT.accountId);
        output = {
          verified: true,
          auth_token: authToken,
          message: "Identity verified successfully."
        };
      } else {
        output = {
          verified: false,
          message: "Verification failed."
        };
      }
      break;
    }

    case "get_account_details": {
      // This is the critical server-side disclosure gate.
      if (!validateAuthToken(args.auth_token, DEMO_ACCOUNT.accountId)) {
        output = {
          authorized: false,
          code: "AUTH_REQUIRED",
          message: "A valid successful verification is required."
        };
        break;
      }

      output = {
        authorized: true,
        account_id: DEMO_ACCOUNT.accountId,
        customer_name: DEMO_ACCOUNT.customerName,
        loan_type: DEMO_ACCOUNT.loanType,
        overdue_amount: DEMO_ACCOUNT.overdueAmount,
        days_past_due: DEMO_ACCOUNT.dpd
      };
      break;
    }

    case "log_promise_to_pay": {
      if (!validateAuthToken(args.auth_token, DEMO_ACCOUNT.accountId)) {
        output = { success: false, code: "AUTH_REQUIRED" };
        break;
      }

      const amount = Number(args.amount);
      const ptpDate = String(args.ptp_date || "");

      if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(ptpDate)) {
        output = {
          success: false,
          code: "INVALID_PTP",
          message: "A positive amount and ISO date are required."
        };
        break;
      }

      const ptpId = `PTP-${Math.floor(1000 + Math.random() * 9000)}`;
      ptps.push({
        ptpId,
        accountId: DEMO_ACCOUNT.accountId,
        ptpDate,
        amount,
        createdAt: new Date().toISOString()
      });

      output = {
        success: true,
        ptp_id: ptpId,
        confirmed_date: ptpDate,
        amount
      };
      break;
    }

    case "send_payment_link": {
      if (!validateAuthToken(args.auth_token, DEMO_ACCOUNT.accountId)) {
        output = { success: false, code: "AUTH_REQUIRED" };
        break;
      }

      const allowed = new Set(["SMS", "WhatsApp", "BOTH"]);
      if (!allowed.has(args.channel)) {
        output = { success: false, code: "INVALID_CHANNEL" };
        break;
      }

      output = {
        success: true,
        link_sent: true,
        channel: args.channel,
        mock_payment_link: "https://pay.example.invalid/kapture/ACC-88392"
      };
      break;
    }

    case "escalate_to_agent": {
      if (!validateAuthToken(args.auth_token, DEMO_ACCOUNT.accountId)) {
        output = { success: false, code: "AUTH_REQUIRED" };
        break;
      }

      output = {
        success: true,
        escalation_id: `ESC-${Math.floor(1000 + Math.random() * 9000)}`,
        reason: args.reason
      };
      break;
    }

    case "mark_disposition": {
      // Wrong-person/DNC may be logged before authentication.
      // Post-auth statuses are normally sent with an auth token.
      const postAuthStatuses = new Set([
        "PTP_AGREED",
        "ALREADY_PAID",
        "DISPUTED",
        "HARDSHIP_ESCALATED",
        "HOSTILE",
        "CALLBACK_REQUEST"
      ]);

      if (postAuthStatuses.has(args.status) &&
          !validateAuthToken(args.auth_token, DEMO_ACCOUNT.accountId)) {
        output = { success: false, code: "AUTH_REQUIRED" };
        break;
      }

      const entry = {
        account_id: args.account_id,
        status: args.status,
        notes: String(args.notes || "").slice(0, 500),
        timestamp: new Date().toISOString()
      };
      dispositions.push(entry);

      output = {
        success: true,
        disposition_logged: args.status,
        timestamp: entry.timestamp
      };
      break;
    }

    default:
      output = {
        success: false,
        code: "UNKNOWN_FUNCTION",
        message: `Unknown function: ${name}`
      };
  }

  return res.status(200).json(result(toolCall.id, output));
});

// Error handler for malformed JSON and other runtime errors
app.use((err, _req, res, _next) => {
  if (!err) return _next();
  // express.json throws a SyntaxError on invalid JSON
  if (err instanceof SyntaxError || err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Kapture mock webhook running on port ${PORT}`);
});
