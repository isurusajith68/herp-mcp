# HERP MCP Server

Node.js MCP server for Hotel ERP integrations.

This service exposes MCP tools over HTTP (`/mcp`) and also provides a direct debug endpoint (`/call-tool`) for local testing.

## Features

- Streamable HTTP MCP endpoint using `@modelcontextprotocol/sdk`
- Multi-tenant PostgreSQL access (tenant schema pattern: `org_<orgId>`)
- Tool: `check_availability` (room availability query)
- Tool: `send_email` (Gmail API send using stored OAuth tokens)

## Project Structure

```text
herp-mcp/
  index.js
  tools/
    availability-tool.js
    sent-email-gapi.js
  db/
    db.js
    get-tenant-dbpool.js
  utils/
    load-tenant-configs.js
  test/
    test.js
```

## Requirements

- Node.js 18+ (Node 20+ recommended)
- PostgreSQL access to:
  - `organizations` table in the main DB
  - tenant schemas named like `org_1`, `org_2`, etc.
  - `public.google_oauth_connections` table for Gmail sending
- Google OAuth app credentials (for Gmail API)

## Environment Variables

Create `.env` in `herp-mcp/`:

```env
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_DATABASE=hotel_erp

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/callback
```

## Install and Run

```bash
npm install
npm run start
```

For development:

```bash
npm run dev
```

Server default URL: `http://localhost:5000`

## HTTP Endpoints

### `GET /`

Health/info endpoint. Returns server status and registered tools.

### `ALL /mcp`

MCP Streamable HTTP endpoint.

- First request must be an MCP `initialize` request (`POST /mcp`).
- Session is tracked with `mcp-session-id` header.
- After initialize, subsequent MCP requests use the same session header.

### `POST /call-tool`

Direct tool invocation for local testing (non-MCP clients).

Request body:

```json
{
  "toolName": "check_availability",
  "args": {
    "orgId": 1,
    "propertyId": 101,
    "checkIn": "2026-03-10",
    "checkOut": "2026-03-12"
  }
}
```

## Available Tools

### `check_availability`

Input:

```json
{
  "orgId": 1,
  "propertyId": 101,
  "roomType": "Deluxe",
  "checkIn": "2026-03-10",
  "checkOut": "2026-03-12"
}
```

Notes:

- `roomType` is optional.
- Uses tenant DB schema from `orgId` (`org_<orgId>`).

### `send_email`

Input:

```json
{
  "orgId": 1,
  "propertyId": 101,
  "to": "guest@example.com",
  "subject": "Booking Confirmation",
  "body": "<p>Your booking is confirmed.</p>",
  "threadId": "optional-thread-id",
  "messageId": "optional-message-id"
}
```

Notes:

- Reads OAuth tokens from `public.google_oauth_connections`.
- Sends via Gmail API with the property-linked Google account.

## Testing

```bash
npm test
```

Current test file (`test/test.js`) is a smoke test scaffold using MCP stdio client transport.

## Troubleshooting

- Startup DB failure:
  - Verify DB credentials and network access.
  - Ensure `organizations` table is reachable.
- Tenant errors (`Configuration not found for tenant`):
  - Ensure `organizations.schemaname` contains values like `org_1`.
- Gmail send errors:
  - Ensure OAuth connection row exists for the given `orgId` + `propertyId`.
  - Reconnect Google account if token is expired or missing Gmail send scope.
