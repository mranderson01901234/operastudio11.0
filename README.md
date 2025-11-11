## OperaStudio – Modular LLM Frontend

OperaStudio is a lightweight Next.js 16 frontend that streams responses from modular backend connectors. The default integration uses Google’s Gemini 2.5 Flash model and is structured so additional MCP/API connectors can be added with minimal friction.

## Prerequisites

- Node.js 20+
- A Google Gemini API key
- A Clerk account (for authentication) - get keys from https://dashboard.clerk.com

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables (either edit the committed `env.config` or create a private `.env.local`):

   ```bash
   # option A: edit the tracked env.config
   nano env.config

   # option B: create a private override
   cp .env.example .env.local
   ```

   Required environment variables:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Your Clerk publishable key (starts with `pk_test_` or `pk_live_`)
   - `CLERK_SECRET_KEY` - Your Clerk secret key (starts with `sk_test_` or `sk_live_`)
   - `GEMINI_API_KEY` - Your Google Gemini API key

3. Launch the development server:

   ```bash
   npm run dev
   ```

   The app is served at [http://localhost:3000](http://localhost:3000).

## Running Tests

Vitest is used for unit and route smoke tests:

```bash
npm test
```

## Architecture Overview

- `app/api/chat/route.ts` streams chat responses via Server-Sent Events.
- `lib/chat/session.ts` maintains a registry of chat providers and normalises streaming output.
- `lib/clients/gemini.ts` wraps the Google Generative AI SDK and exposes a streaming helper.
- `components/chat/chat-interface.tsx` renders the chat UI and consumes streaming responses.
- `lib/mcp/` is reserved for future MCP connectors—each connector should expose the same interface as the Gemini client.

## Adding a New Connector

1. Implement a module under `lib/mcp/` that exposes a `streamChat` async generator.
2. Register the connector in `lib/chat/session.ts`.
3. Pass the new provider ID from the frontend (or default it server-side).

## Deployment Notes

- Keep LLM calls server-side to shield credentials and enable low-latency streaming.
- Deploy the backend close to the Gemini region for best performance.
- Tail logs for `chat.stream.success` / `chat.stream.error` entries to monitor latency and failures.
