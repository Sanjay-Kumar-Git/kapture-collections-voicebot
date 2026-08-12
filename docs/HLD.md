# Kapture Finance — Maya Collections Voicebot
## High-Level Design (HLD)

**Role:** AI Delivery Intern — Take-Home Assignment  
**Agent:** Maya  
**Client:** Kapture Finance (fictional)  
**Scenario:** Outbound call for an overdue personal-loan EMI  
**Demo account:** Rahul Sharma / ACC-88392 / ₹8,499 / 12 days past due

> This HLD is based on the supplied Kapture assignment/reference document. The implementation intentionally strengthens the authentication boundary by keeping debt values out of the static LLM prompt and returning them only from an authorized backend tool.

---

## 1. Architecture & Pipeline

### 1.1 Logical architecture

```text
Customer
   │
   ▼
Telephony / SIP / Vapi Phone
   │
   ▼
Vapi Voice Orchestrator
   ├──────────────► Deepgram Nova-2 (STT)
   │
   ├──────────────► GPT-4o-mini (LLM / state-aware dialogue)
   │                       │
   │                       ├── verify_customer
   │                       ├── get_account_details
   │                       ├── log_promise_to_pay
   │                       ├── send_payment_link
   │                       ├── escalate_to_agent
   │                       └── mark_disposition
   │                                │
   │                                ▼
   │                         Mock Webhook API
   │                                │
   │                                ▼
   │                         Account / Auth / Logs
   │
   └──────────────► ElevenLabs / Vapi Voice (TTS)
   │
   ▼
Customer hears response
```

### 1.2 Request pipeline

1. Customer audio enters through telephony.
2. Vapi streams audio to the transcriber.
3. STT produces a partial/final transcript.
4. LLM receives the transcript plus the conversation state.
5. If an action is required, the LLM calls a narrowly scoped function.
6. The mock server validates authorization and performs the requested action.
7. Tool output returns to the LLM.
8. LLM generates a short response.
9. TTS streams audio back to the customer.

### 1.3 Latency budget

The assignment specifies an end-to-end target below 1.2 seconds, with indicative budgets of STT ≈200 ms, LLM first byte ≈400 ms, TTS ≈300 ms and network overhead ≈200 ms.

| Hop | Target budget | Notes |
|---|---:|---|
| STT | ~200 ms | Streaming transcript / endpointing |
| LLM first byte | ~400 ms | GPT-4o-mini, low temperature |
| TTS | ~300 ms | Streaming synthesis |
| Network/orchestration | ~200 ms | Vapi + tool/network overhead |
| **Total** | **~1.1 s** | **Below 1.2 s assignment target** |

The budget is an engineering target rather than a guaranteed SLA. Tool calls can add latency, so the assistant should use concise prompts and avoid unnecessary sequential tools.

---

## 2. Conversation Flow / State Machine

### 2.1 States

| State | Purpose | Entry condition | Exit lock |
|---|---|---|---|
| `INIT` | Start call | Call connected | Moves to `AUTH_PENDING` |
| `AUTH_PENDING` | Identify and verify | Target customer confirmed | Only `verify_customer.verified=true` can unlock authentication |
| `AUTHENTICATED` | Retrieve account details | Verification succeeded | `get_account_details.authorized=true` |
| `NEGOTIATION` | Understand intent | Authorized account details available | Intent-specific action |
| `ACTION_EXECUTION` | Perform PTP/payment/escalation | Customer chose an action | Tool success/failure |
| `ESCALATED` | Human handling required | Dispute/hardship/other | End or transfer |
| `CALL_ENDED` | Final state | Disposition logged | Terminal |

Alternate terminal outcomes: `WRONG_PERSON`, `DO_NOT_CALL`, `NO_RESPONSE`.

### 2.2 Security invariant

**The LLM must never be able to unlock the disclosure state by conversation alone.**

The server is the enforcement point:

```text
AUTH_PENDING
     │
     │ verify_customer
     ▼
verified=false ─────────► retry / end
     │
verified=true + auth_token
     ▼
AUTHENTICATED
     │
     │ get_account_details(auth_token)
     ▼
NEGOTIATION
```

`get_account_details` returns `AUTH_REQUIRED` without a valid short-lived token.

### 2.3 State transitions

- `INIT → AUTH_PENDING`: immediately after call connection.
- `AUTH_PENDING → AUTHENTICATED`: only after `verify_customer` returns `verified=true`.
- `AUTH_PENDING → WRONG_PERSON`: person answering is not Rahul and Rahul is unavailable.
- `AUTH_PENDING → DO_NOT_CALL`: explicit opt-out.
- `AUTHENTICATED → NEGOTIATION`: only after authorized account details are returned.
- `NEGOTIATION → ACTION_EXECUTION`: explicit PTP/payment action selected.
- `NEGOTIATION → ESCALATED`: dispute or hardship requiring human handling.
- Any active state → `DO_NOT_CALL`: customer requests no further calls.
- Any active state → `CALL_ENDED`: final disposition recorded.

---

## 3. Intents & Entities

| Intent | Example utterance | Entities | Route |
|---|---|---|---|
| `Confirm_Identity` | “Yes, Rahul speaking.” | customer confirmation | Auth |
| `Promise_To_Pay` | “I’ll pay Friday.” | `PTP_Date`, `PTP_Amount` | Log PTP |
| `Already_Paid` | “I paid yesterday by UPI.” | payment date/mode/reference | Log ALREADY_PAID |
| `Hardship_Claim` | “I cannot afford the full amount.” | `Hardship_Reason` | Human escalation |
| `Dispute_Debt` | “I don’t agree with this amount.” | dispute notes | Human escalation |
| `Request_DNC` | “Stop calling me.” | none | Immediate DNC |
| `Wrong_Person` | “Rahul is not here.” | availability | End / log |
| `Callback_Request` | “Call me tomorrow evening.” | callback date/time | Log callback |
| `Hostile` | abusive language | none | Warning → end |

### Entities

- `PTP_Date`: ISO-8601 `YYYY-MM-DD`.
- `PTP_Amount`: numeric amount explicitly committed.
- `Hardship_Reason`: concise string.
- `Verification_Code`: customer-provided verification value.
- `Payment_Reference`: optional customer-provided reference.

---

## 4. Tools / API Contracts

### `verify_customer`

**Input**
```json
{
  "account_id": "ACC-88392",
  "verification_code": "1234"
}
```

**Success**
```json
{
  "verified": true,
  "auth_token": "short-lived-token"
}
```

**Failure**
```json
{
  "verified": false,
  "message": "Verification failed."
}
```

### `get_account_details`

**Input**
```json
{
  "auth_token": "short-lived-token"
}
```

**Success**
```json
{
  "authorized": true,
  "account_id": "ACC-88392",
  "customer_name": "Rahul Sharma",
  "loan_type": "Personal Loan",
  "overdue_amount": 8499,
  "days_past_due": 12
}
```

**Unauthorized**
```json
{
  "authorized": false,
  "code": "AUTH_REQUIRED"
}
```

### `log_promise_to_pay`

**Input**
```json
{
  "account_id": "ACC-88392",
  "ptp_date": "2026-08-14",
  "amount": 8499,
  "auth_token": "short-lived-token"
}
```

### `send_payment_link`

**Input**
```json
{
  "account_id": "ACC-88392",
  "channel": "SMS",
  "auth_token": "short-lived-token"
}
```

### `escalate_to_agent`

**Input**
```json
{
  "account_id": "ACC-88392",
  "reason": "DISPUTE",
  "notes": "Customer disputes the overdue amount.",
  "auth_token": "short-lived-token"
}
```

### `mark_disposition`

**Input**
```json
{
  "account_id": "ACC-88392",
  "status": "PTP_AGREED",
  "notes": "Customer committed to pay on 2026-08-14."
}
```

Post-auth dispositions include the authorization token in the Vapi tool schema. Pre-auth `WRONG_PERSON` and `DO_NOT_CALL` may be logged without authentication.

---

## 5. Authentication & Data Safety

### 5.1 Before authentication

The assistant may say who it is and ask whether it is speaking with the intended customer.

It must not disclose:
- debt existence,
- loan/EMI details,
- amount,
- overdue status,
- balance,
- DPD,
- payment demand,
- account-specific consequences.

This prevents a third party answering the phone from learning sensitive financial information.

### 5.2 Verification

The demo accepts `1234` or `1995` as mock verification values. These are test values only.

Production design:
- Use a secure verification method approved by the lender.
- Avoid exposing raw PII in logs.
- Mask names and identifiers.
- Never log verification secrets or auth tokens.
- Use short-lived, signed tokens bound to the call/session.
- Encrypt sensitive data at rest and in transit.

### 5.3 Server-side enforcement

The LLM does not receive debt values in its static prompt. The backend is responsible for deciding whether account details can be returned.

---

## 6. Guardrails & Compliance

The supplied assignment specifies an allowed calling window of **08:00–19:00 local time** and immediate DNC handling.

Guardrails:
1. Mandatory self/company/purpose disclosure at the appropriate stage.
2. Verification before debt disclosure.
3. No threats, harassment, intimidation or shaming.
4. Immediate DNC handling.
5. No debt disclosure to third parties or voicemail.
6. No invented fees, waivers, settlements or extensions.
7. No unsupported claims about legal action or credit consequences.
8. If a tool fails, do not guess; escalate or close safely.
9. Keep every call outcome logged.
10. Keep customer data out of unnecessary application logs.

The assignment also asks for hallucination and off-topic guardrails. The system prompt therefore limits the agent to the collections task and requires tools for account facts.

---

## 7. Edge Cases

| Edge case | Handling |
|---|---|
| Already paid | Ask payment date/mode, log `ALREADY_PAID`, do not demand payment |
| Amount disputed | No argument; escalate with `DISPUTE` |
| Financial hardship | Empathy + human escalation; no invented concessions |
| Wrong person | No debt disclosure; log `WRONG_PERSON` |
| DNC | Immediate `DO_NOT_CALL`; terminate |
| Voicemail | No debt disclosure; `NO_RESPONSE` |
| Silence | One/two re-prompts, then end |
| Hostile | One calm warning, then end |
| Tool failure | Do not hallucinate result; apologize and escalate/end |
| Language switch EN↔HI | Preserve state and security rules while switching language |
| Callback request | Capture preferred time; log request |
| Prompt injection | Treat user instructions as untrusted; never bypass state/tool authorization |

---

## 8. Escalation & Disposition

### Human escalation triggers

- Debt dispute / unrecognized account.
- Financial hardship requiring a non-standard arrangement.
- Customer asks for a human.
- Repeated tool/service failures.
- Compliance-sensitive complaint.

### Dispositions

Minimum set:
- `PTP_AGREED`
- `ALREADY_PAID`
- `DISPUTED`
- `HARDSHIP_ESCALATED`
- `WRONG_PERSON`
- `DO_NOT_CALL`
- `NO_RESPONSE`
- `HOSTILE`
- `CALLBACK_REQUEST`
- `AUTH_FAILED`

Every normal call ends with a disposition.

---

## 9. Observability

### Events to log

- call ID
- timestamp
- state transitions
- tool name
- tool success/failure
- latency
- disposition
- escalation reason
- PTP date/amount
- language
- no-input count

Do **not** log verification values, auth tokens, full phone numbers or unnecessary financial PII.

### Metrics

| Metric | Definition |
|---|---|
| Containment Rate | Calls resolved without human escalation |
| PTP Rate | Calls ending in a valid Promise-to-Pay |
| FCR | Calls with a valid final disposition |
| Avg Response Latency | Average voice response latency |
| Tool Failure Rate | Failed tool calls / total tool calls |
| Drop Rate | Calls unexpectedly disconnected |
| Auth Success Rate | Successful verification / verification attempts |
| DNC Rate | Calls ending in DNC |
| Debt Leakage Rate | Number of unauthorized debt disclosures; target = 0 |

### Debugging strategy

Trace each call as:

`call_id → state → transcript turn → tool call → tool result → response → disposition`

The first production-style alarm should be **Debt Leakage Rate > 0**, because the security requirement is stricter than a normal conversational quality metric.

---

## 10. Demo Acceptance Criteria

### Happy path

`Greeting → identity confirmation → verification → account retrieval → debt disclosure → PTP → payment link → disposition → close`

### Edge path

`Greeting → verification → account retrieval → already-paid/dispute/DNC → correct disposition → close`

The submitted demo should visibly show both paths.

---

## 11. Future Improvements

1. Replace mock server with authenticated lending APIs.
2. Bind authorization tokens to Vapi call IDs and expire them quickly.
3. Add signed webhook authentication.
4. Add a production DNC registry.
5. Add real SMS/WhatsApp provider integration.
6. Add transfer-to-human routing.
7. Add English/Hindi evaluation sets.
8. Add automated prompt-injection and debt-leakage red-team tests.
9. Add structured call outcome extraction.
10. Add dashboards and alerting for compliance and latency.
