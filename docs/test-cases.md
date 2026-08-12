# Test Cases

This document lists the test scenarios represented in `tests/test_cases.json`. These are descriptive test cases for reviewer validation — they were not executed here by the preparation script.

TC01 — Successful verification
- Scenario: Happy path; verification succeeds and PTP flow completes
- Input: verify_customer with valid value (e.g., 1234)
- Expected: get_account_details authorized, log_promise_to_pay succeeds, send_payment_link succeeds, mark_disposition(PTP_AGREED)
- Tools: verify_customer, get_account_details, log_promise_to_pay, send_payment_link, mark_disposition
- Security: auth_token required for post-auth calls

TC02 — Failed verification
- Scenario: Incorrect verification value
- Expected: verify_customer returns verified:false; agent offers one retry; no account disclosure
- Tools: verify_customer, mark_disposition (AUTH_FAILED or NO_RESPONSE)
- Security: no account data revealed

TC03 — Account access without authentication
- Scenario: get_account_details called without a valid auth_token
- Expected: get_account_details returns AUTH_REQUIRED and no account facts
- Security: protected

TC04 — Account access after authentication
- Scenario: verify_customer -> verified:true -> get_account_details
- Expected: authorized account details returned

TC05 — Promise to Pay (PTP)
- Scenario: Authenticated customer commits to a date and amount
- Expected: log_promise_to_pay validates date and amount, returns ptp_id; send_payment_link may be sent; disposition PTP_AGREED

TC06 — Payment link
- Scenario: send_payment_link with channel SMS/WhatsApp/BOTH
- Expected: link_sent true and mock link returned

TC07 — Already Paid
- Scenario: Customer reports payment already made
- Expected: mark_disposition(ALREADY_PAID) and no PTP

TC08 — Financial hardship
- Scenario: Customer requests hardship assistance
- Expected: escalate_to_agent(HARDSHIP_REQUEST) and HARDSHIP_ESCALATED disposition

TC09 — Human escalation
- Scenario: Dispute or complex case
- Expected: escalate_to_agent(DISPUTE) and DISPUTED disposition

TC10 — Wrong person / DNC
- Scenario: Call answered by third party, or customer requests DNC
- Expected: mark_disposition(WRONG_PERSON) or mark_disposition(DO_NOT_CALL)

TC11 — Invalid PTP date
- Scenario: Non-ISO date or invalid amount
- Expected: log_promise_to_pay returns INVALID_PTP

TC12 — Invalid payment channel
- Scenario: send_payment_link with unsupported channel
- Expected: INVALID_CHANNEL error

Refer to `tests/test_cases.json` for the canonical test definitions.
