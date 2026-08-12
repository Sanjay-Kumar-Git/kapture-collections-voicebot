# Kapture Finance — Maya Collections Voicebot

AI Delivery Intern take-home assignment implementation.

## Scope

This repository implements the requested outbound collections voicebot for the fictional Kapture Finance lending client. The design follows the supplied assignment brief: a state-enforced authentication gate, compliant collections conversation, mock tool APIs, edge-case handling, observability, and a Vapi build plan.
# Kapture Collections Voicebot

Voice-based collections assistant prototype (mock backend and Vapi configuration) built for the Kapture Finance assessment.

## Overview

This repository contains a Node.js/Express mock webhook that implements six custom tools used by a Vapi assistant. It is a demo/mock service only — no real customer data or production integrations are included.

## Architecture

Customer → Vapi assistant → custom tools → public webhook → Node.js/Express mock backend

During local development, `ngrok` is used to expose `localhost:3000` to Vapi. For production, deploy the mock server to a cloud service and configure the Vapi tool URLs accordingly.

## Features

- Customer identity verification (`verify_customer`)
- Authentication-gated account disclosure (`get_account_details`)
- Promise-to-pay logging (`log_promise_to_pay`)
- Payment link simulation (`send_payment_link`)
- Human escalation (`escalate_to_agent`)
- Call disposition logging (`mark_disposition`)
- Handling for already-paid, wrong-person, DNC, hardship, disputes, and hostile callers

## Tools

All tools are defined in `vapi/tool_definitions.json` and implemented by `mock-server/server.js`.

- `verify_customer`: verify identity using `account_id` and `verification_code`. Returns `verified` and a short-lived `auth_token` on success.
- `get_account_details`: requires `auth_token`; returns mock account facts (overdue amount, days past due) when authorized.
- `log_promise_to_pay`: records a PTP with `account_id`, `ptp_date` (ISO YYYY-MM-DD), and `amount`; requires `auth_token`.
- `send_payment_link`: sends a mock payment link via `channel` (`SMS`, `WhatsApp`, `BOTH`); requires `auth_token`.
- `escalate_to_agent`: create a human escalation for `DISPUTE`, `HARDSHIP_REQUEST`, or `OTHER`; requires `auth_token`.
- `mark_disposition`: log final call disposition; some dispositions require `auth_token` while `WRONG_PERSON`/`DO_NOT_CALL` may be logged pre-auth.

## Local setup

```bash
cd mock-server
npm install
npm start
```

Check health:

```text
GET http://localhost:3000/health

Response:
{
    "ok": true,
    "service": "kapture-mock-webhook"
}
```

## ngrok (development)

```bash
ngrok http 3000
```

Point Vapi's webhook URL to:

https://YOUR-NGROK-DOMAIN/webhook

Do not hard-code any ngrok URL in source code.

## Vapi configuration

Use `vapi/system_prompt.txt` as the assistant prompt and import `vapi/tool_definitions.json` as the tool schemas. All tools call the same webhook path `/webhook`; the backend selects the desired function from `toolCall.function.name`.

## Security

- Verification gate: no account details before successful `verify_customer`.
- Short-lived in-memory `auth_token` in the demo (replace with signed tokens in production).
- Do not commit secrets, tokens, or ngrok credentials to source control.
- Logging scrubs `verification_code` and `auth_token`.

## Testing

Test scenarios are listed in `tests/test_cases.json`. They include:
1. Successful verification
2. Failed verification
3. Wrong person / DNC
4. Authenticated account access
5. Promise-to-pay flows
6. Payment link simulation
7. Mark disposition
8. Escalation and hardship
9. Already-paid handling

## Known limitations

- In-memory state only — restarting the server clears PTPs and dispositions.
- Payment links and escalations are simulated.
- No persistence, monitoring, or production-grade auth.

## Next steps for production

- Persist data to a database (Postgres, etc.)
- Use signed tokens or session-bound auth
- Add webhook HMAC verification and a secrets manager
- Add monitoring, rate-limiting, and audit logs

## Files changed by submission prep

See the separate submission checklist for files created and updated during repository preparation.

---
Minimal, focused README tailored for reviewers and deployers.
- `verify_customer`
