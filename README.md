# Kapture Finance — Collections Voicebot ("Maya")

Outbound Voice AI Collections Agent built for the Kapture AI Delivery take-home assignment.

**v2.0** — authentication is now a two-step, token-gated process (`verify_customer` →
`auth_token` → `get_account_details`), matching the deployed Vapi assistant (v19+).

## What's in this repo

```
kapture-collections-voicebot/
├── README.md
├── docs/
│   ├── HLD_Document.docx         # Full high-level design (Task 1), v2.0
│   ├── System_Architecture.png   # Pipeline diagram
│   ├── State_Machine.png         # Conversation state machine diagram
│   └── architecture_sequence.mmd # Mermaid source for the call sequence diagram
├── vapi/
│   ├── system_prompt.txt         # Production Vapi system prompt (v19, token-gated)
│   └── tool_definitions.json     # 7 tool/function JSON schemas
├── mock-server/
│   ├── package.json
│   ├── server.js                 # Express webhook: issues + validates auth_token
│   └── .env.example
└── tests/
    └── test_cases.json           # Evaluation matrix (10 cases)
```

## Design choices

- **Model:** GPT-4o at `temperature 0.1` — collections calls need low variance and
  strict adherence to the disclosure and disposition rules, not creativity.
- **STT:** Deepgram Nova-2 — good telephony-audio accuracy at low latency, with
  built-in support for the English/Hindi code-switching bonus scenario.
- **TTS:** ElevenLabs/Cartesia — natural, warm delivery matters here: this is a
  sensitive conversation (unpaid debt) and a robotic voice increases hang-ups.
- **Auth is two-step and token-gated, not just prompt-enforced.** `verify_customer`
  confirms identity and issues a short-lived, single-call `auth_token`.
  `get_account_details` is the *only* tool that returns real debt figures, and it
  requires that exact token. This means the LLM can never self-report a customer as
  "verified" and jump straight to disclosure — there is a second, independent tool
  boundary in the way, and it's called out explicitly in the HLD (Section 2)
  because it's the single most important compliance property of the system.
- **Tool-execution success ≠ business success.** The prompt explicitly requires
  inspecting the `verified` / `authorized` / `success` field in every tool result
  before speaking about an outcome — "HTTP 200" is never treated as "verified."
- **Every call ends with exactly one `mark_disposition` call — including calls that
  never reach authentication.** A failed-verification call logs
  `VERIFICATION_FAILED` rather than ending silently; this was a gap in an earlier
  draft of the prompt and is now fixed.
- **Tokens are short-lived, single-call, and single-use.** The mock server expires
  them after 10 minutes and invalidates them the moment `mark_disposition` fires,
  so a token can't be replayed into a later call.

## Setup

### 1. Mock webhook server
```bash
cd mock-server
npm install
cp .env.example .env
npm start          # runs on http://localhost:3000
```
Expose it publicly for Vapi to reach:
```bash
ngrok http 3000
```
Copy the `https://...ngrok-free.app/webhook` URL — you'll paste it into each tool's
server URL in the Vapi dashboard. You can inspect everything the bot has logged
during a test session at `GET /calls`.

### 2. Vapi assistant
1. Vapi Dashboard → **Assistants** → **Create Assistant** → **Blank Template**.
2. **Transcriber:** Deepgram, model `nova-2`, language `en` (or `multi` for the
   bilingual bonus).
3. **Model:** OpenAI `gpt-4o` (or `gpt-4o-mini`), temperature `0.1`.
4. **Voice:** ElevenLabs or Cartesia, a professional, warm voice.
5. **First message:**
   `"Hello, this is Maya calling from Kapture Finance. Am I speaking with Mr. Rahul Sharma?"`
6. Paste the contents of `vapi/system_prompt.txt` into the system prompt field.
7. **Tools tab:** import each schema from `vapi/tool_definitions.json` (7 tools:
   `verify_customer`, `get_account_details`, `log_promise_to_pay`,
   `send_payment_link`, `escalate_to_agent`, `mark_disposition`,
   `end_outbound_call`), pointing every custom tool's server URL at your ngrok
   `/webhook` URL. `end_outbound_call` may instead map to Vapi's built-in "End
   Call" function if you prefer not to route it through the webhook.
8. Save, then use **Talk to Assistant** (web call) to test before placing/receiving
   real phone calls.

### 3. Test the flows
Use `tests/test_cases.json` as your script. At minimum, run:
- **Happy path:** greet → verify (code `1234` or `1995`) → account details
  authorized → disclose debt → agree to pay Friday → link sent →
  disposition `PTP_AGREED`.
- **One edge case:** already-paid, dispute, wrong-person, or do-not-call.
- **Auth-boundary check:** deliberately give a wrong code twice and confirm the
  call ends with `VERIFICATION_FAILED` and zero debt words spoken.

### 4. Record the demo
2–4 minutes, showing the happy path and one edge case, via Loom/OBS or a shared
Vapi call recording.

## What broke / how it was debugged

- **Missing disposition on failed verification.** An earlier version of the prompt
  ended the call after two failed verification attempts without ever calling
  `mark_disposition`, silently breaking the "every call gets a logged outcome"
  guarantee. Fixed by adding an explicit `VERIFICATION_FAILED` disposition call on
  both failure paths (failed `verify_customer` retry, and `get_account_details`
  returning `authorized:false`/`AUTH_REQUIRED`).
- **Tool/prompt drift.** The tool schemas and mock server were built against an
  earlier, single-step verification design and fell out of sync once the prompt
  moved to the two-step `auth_token` flow (adding `get_account_details` as its own
  tool, and requiring `auth_token` on every downstream call). Fixed by rewriting
  `tool_definitions.json` and `server.js` to issue and validate a real token.
- *(Add your own notes here after running actual test calls on Vapi — e.g. any
  case where the agent disclosed debt info before authorization succeeded, which
  should never happen; any tool call with a malformed date the LLM didn't
  normalize correctly; latency spikes and which hop caused them.)*

## What I'd improve with more time

- Move state enforcement fully server-side (a thin orchestrator in front of Vapi's
  tool-calling) rather than relying on Vapi's built-in flow plus prompt discipline,
  so a disclosure-before-auth failure is structurally impossible, not just unlikely.
- Real payment gateway + CRM integration instead of the mocked webhook responses,
  and a real token store (Redis/similar) instead of the in-memory Map.
- A proper eval harness that replays `tests/test_cases.json` against transcripts
  automatically and flags policy violations (pre-auth disclosure, missing
  disposition, token reuse across calls, waiver >10%) rather than manual QA.
- Call recording + transcript pipeline feeding the observability metrics in the HLD
  (containment rate, PTP rate, FCR, auth success rate, latency, drop rate) into a
  dashboard.

## Bonus items addressed

- **Bilingual handling:** `system_prompt.txt` includes an explicit mid-call
  English⇄Hindi switch rule that preserves all authentication rules, and
  `tests/test_cases.json` (TC-003) covers it.
- **Mock payment-link trigger:** `send_payment_link` in `mock-server/server.js`
  returns a mocked SMS/WhatsApp confirmation, gated by `auth_token`.
- **Test-at-scale note:** `tests/test_cases.json` is a 10-case matrix covering the
  authentication guardrail, all negotiation branches, silence/voicemail, abusive
  callers, and the bilingual switch — this is the seed of an automated eval suite
  (see "What I'd improve" above for how to scale it).
