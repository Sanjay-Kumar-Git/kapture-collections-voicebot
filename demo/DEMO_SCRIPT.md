# Demo Recording Script — 2 to 4 Minutes

## Before recording

1. Start the mock server:
   `cd mock-server && npm install && npm start`
2. Start ngrok:
   `ngrok http 3000`
3. Configure the Vapi function tools with the HTTPS webhook URL.
4. Open the Maya assistant and confirm it is published.
5. Use the demo account `ACC-88392`.
6. Use `1234` as the successful verification value.

## Path A — Happy Path / PTP

**Maya:** Hello, this is Maya calling from Kapture Finance. Am I speaking with Rahul Sharma?

**Rahul:** Yes.

**Maya:** For security purposes, could you please confirm the last four digits of your PAN card or your year of birth?

**Rahul:** 1234.

**[Tool] verify_customer → verified=true + auth_token**

**[Tool] get_account_details(auth_token) → ₹8,499 / 12 DPD**

**Maya:** Thank you for verifying. I'm calling regarding your Kapture Finance personal loan. Your current overdue EMI is ₹8,499, which is 12 days past due. How would you like to proceed?

**Rahul:** I can pay it this Friday.

**Maya:** Thank you. I have recorded that commitment. Would you like me to send a payment link by SMS?

**Rahul:** Yes.

**[Tool] log_promise_to_pay(auth_token, date, amount)**

**[Tool] send_payment_link(auth_token, SMS)**

**[Tool] mark_disposition(PTP_AGREED, auth_token)**

**Maya:** Thank you for your time today. Have a good day.

## Path B — Already Paid

Authenticate again.

**Maya:** ...your current overdue EMI is ₹8,499, which is 12 days past due. How would you like to proceed?

**Rahul:** I already paid yesterday through UPI.

**Maya:** Understood. Could you tell me the payment date and mode so I can record it accurately?

**Rahul:** Yesterday by UPI.

**[Tool] mark_disposition(ALREADY_PAID, auth_token)**

**Maya:** Thank you. I’ve recorded that information for review. Have a good day.

## Optional Path C — DNC

Before authentication or at any point:

**Rahul:** Do not call me again.

**Maya:** Understood. I’ll register your request. Thank you for your time.

**[Tool] mark_disposition(DO_NOT_CALL)**

End immediately.

## What to show on screen

During the Loom/recording, briefly show:
- Vapi assistant configuration.
- Tool definitions.
- The mock server terminal receiving the tool call.
- The call transcript.
- Successful PTP path.
- One edge case.
