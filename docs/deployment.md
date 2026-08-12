# Deployment Guide — Mock Server

This guide describes deploying the mock webhook to a generic cloud provider (Render, Heroku, etc.).

1. Push the repository to GitHub.
2. Create a new Node.js service on your cloud provider and connect the GitHub repo.
3. Set the build command: (none required for this simple app)
4. Set the start command: `node mock-server/server.js` or from the `mock-server` folder `npm start`.
5. Set environment variables:
   - `PORT` — the port the platform assigns (default 3000 locally)
6. Health endpoint: `GET /health` should return `{ "ok": true, "service": "kapture-mock-webhook" }`.
7. Webhook endpoint: POST `/webhook` — configure Vapi to call `https://YOUR_DEPLOYED_DOMAIN/webhook`.

Notes:
- Do not store real credentials in the repo; use the platform's secret manager for any keys.
- For production-like testing, replace in-memory storage with a persistent database and use signed tokens.
- Add monitoring and alerts for error rates and latency.
