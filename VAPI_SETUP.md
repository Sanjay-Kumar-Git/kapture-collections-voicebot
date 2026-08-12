# Vapi Setup — Maya Collections Voicebot

This checklist is intentionally aligned to the current Vapi Assistants + Custom Tools model.

## 1. Create the assistant

In the Vapi Dashboard:

1. Open **Assistants**.
2. Create a new Assistant.
3. Name it `Maya — Kapture Collections`.
4. Use an Assistant rather than a Workflow.
5. Paste `vapi/system_prompt.txt` into the system prompt.
6. Publish after saving.

## 2. Configure the voice pipeline

Recommended take-home configuration:

- Model: `gpt-4o-mini`
- Temperature: `0.1`
- Transcriber: Deepgram `nova-2`
- Voice: ElevenLabs or a suitable Vapi voice
- Language: English for the primary demo

The assignment's reference document proposes the same general provider choices. The main reason for the configuration is predictable behavior and low latency.

## 3. First message

Use:

> Hello, this is Maya calling from Kapture Finance. Am I speaking with Rahul Sharma?

This does not reveal debt information.

## 4. Create custom tools

Create these six Function tools:

1. `verify_customer`
2. `get_account_details`
3. `log_promise_to_pay`
4. `send_payment_link`
5. `escalate_to_agent`
6. `mark_disposition`

The exact schemas are in:

`vapi/tool_definitions.json`

## 5. Start the mock server

From the repository:

```bash
cd mock-server
npm install
npm start
```

Expected:

```text
Kapture mock webhook running on http://localhost:3000
```

Test:

```bash
curl http://localhost:3000/health
```

## 6. Expose the webhook

For a local demo:

```bash
ngrok http 3000
```

Copy the HTTPS URL and append:

```text
/webhook
```

Example:

```text
https://YOUR-DOMAIN.ngrok-free.app/webhook
```

Use that as the server URL for the custom function tools.

## 7. Test the security gate first

Say:

> Yes, I am Rahul. How much do I owe?

The assistant must refuse to disclose the debt and ask for verification.

Then say:

> 1234

Expected tool sequence:

```text
verify_customer
→ verified=true + auth_token
→ get_account_details(auth_token)
→ debt details become available
```

If `get_account_details` is called before verification, the server should return:

```json
{
  "authorized": false,
  "code": "AUTH_REQUIRED"
}
```

## 8. Happy-path demo

Use:

- Identity: Rahul
- Verification: `1234`
- Payment date: Friday
- Amount: ₹8,499
- Payment link: SMS

Expected:

```text
verify_customer
get_account_details
log_promise_to_pay
send_payment_link
mark_disposition(PTP_AGREED)
```

## 9. Edge-case demo

Use the already-paid path:

> I already paid yesterday through UPI.

Expected:

```text
mark_disposition(ALREADY_PAID)
```

No new payment should be demanded.

## 10. DNC test

Say:

> Do not call me again.

Expected:

```text
mark_disposition(DO_NOT_CALL)
→ immediate end
```

## 11. Record the demo

Record 2–4 minutes.

Show:
- Vapi Assistant
- tool definitions
- mock server terminal
- happy path
- one edge case

Do not expose API keys or private credentials in the recording.

## 12. Submission folder

Submit:

```text
HLD_Document.pdf
System_Architecture.png
docs/HLD.md
vapi/system_prompt.txt
vapi/tool_definitions.json
README.md
server.js
package.json
test_cases.json
demo recording / Loom link
```

## 13. Important note

The assignment asks for a working Vapi call and recording. The files in this package are the implementation assets, but the Vapi account, phone number and recording must be created from your own Vapi account.
