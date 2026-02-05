# Prompts and Docs Modernization Plan

**Goal:** Improve MCP prompts and boilerplate docs (REACT_BOILERPLATE.md, MODERN_STACK_QUICK_REFERENCE.md, API_LAYER_GUIDE.md) so generated apps are more modern and performant, with clear patterns for **Supabase Edge Functions** and **modern LLM APIs**.

**Scope:** Plan only. No implementation in this document.

**§2 Decisions (applied):** Animation = **Option A** (Tailwind CSS animations + custom keyframes only; no Motion library). API client = **Option A** (native `fetch()` in `src/lib/api.ts` only).

---

## 1. Current State and Gaps

### 1.1 REACT_BOILERPLATE.md

| Area | Current | Gap |
|------|---------|-----|
| **API** | Native `fetch()` in `src/lib/api.ts` only; no Supabase client pattern in main flow | No guidance when to use Supabase client vs generic API; no Edge Functions usage |
| **Backend** | Assumes external REST API (`VITE_API_URL`) | No first-class Supabase (Auth, DB, Realtime, Storage, Edge) as default backend option |
| **LLM / AI** | Not mentioned | No pattern for LLM calls (chat, completions, streaming); no “call via Edge Function” guidance |
| **Animations** | Tailwind CSS animations + custom keyframes only; “NOT Motion library or framer-motion” | Deliberately minimal; fine to keep but should be explicit vs Quick Reference |
| **Performance** | React Query, code splitting, tree-shaking | No Edge Functions for heavy/server-side work; no streaming or edge-caching patterns |

### 1.2 MODERN_STACK_QUICK_REFERENCE.md (used as “Quick Reference” in first prompt)

| Area | Current | Gap |
|------|---------|-----|
| **Animations** | “ALWAYS use Motion library” (motion/react) | **Conflict:** REACT_BOILERPLATE says Tailwind animations only, no Motion. Needs single source of truth |
| **API client** | Axios (`apiClient`) in examples | **Conflict:** REACT_BOILERPLATE and server prompts say “native fetch() with API utilities in src/lib/api.ts”. API_LAYER_GUIDE uses Axios |
| **Supabase** | Not mentioned | No Supabase client, Edge Functions, or when to use Edge vs client |
| **LLM** | Not mentioned | No quick pattern for “LLM via Edge Function” or modern SDK usage |

### 1.3 API_LAYER_GUIDE.md

| Area | Current | Gap |
|------|---------|-----|
| **Client** | Axios-based `apiClient` with interceptors | Inconsistent with REACT_BOILERPLATE (native fetch). Should support both and recommend one canonical approach |
| **Supabase** | Not in scope | No section on Supabase as data layer; no Edge Functions as “API” endpoints |
| **LLM** | Not in scope | No pattern: “LLM calls go through Edge Function / backend”, streaming, error handling |

### 1.4 MCP Server Directive Prompts (dist/server.js)

- First prompt injects: REACT_BOILERPLATE, MODERN_STACK_QUICK_REFERENCE, API_LAYER_GUIDE, DESIGN_REFERENCE.
- Subsequent prompt injects: Design Reference, Supabase instructions (when configured), Success Criteria.
- **Risk:** Conflicting instructions (Motion vs Tailwind-only, Axios vs fetch) can confuse the agent.

---

## 2. Alignment and Consistency Decisions (to be reflected in docs)

Before editing the three docs, decide and document:

1. **Animation:** One canonical choice:
   - **Option A:** Tailwind CSS animations + custom keyframes only (current REACT_BOILERPLATE). Update MODERN_STACK_QUICK_REFERENCE to match and remove Motion.
   - **Option B:** Motion library as primary. Update REACT_BOILERPLATE and server prompts to allow Motion and document when to use Motion vs Tailwind.

2. **API client:** One canonical choice:
   - **Option A:** Native `fetch()` in `src/lib/api.ts` only. Update API_LAYER_GUIDE to use fetch-based client and keep Axios as optional/legacy.
   - **Option B:** Axios as default. Update REACT_BOILERPLATE and server prompts to reference Axios.

3. **Supabase:** Treat as first-class when configured:
   - Client: `src/integrations/supabase/client.ts` (or `src/lib/supabase.ts`) for Auth, DB, Realtime, Storage.
   - Edge Functions: Preferred for server-side logic, LLM proxy, webhooks, and anything that must not run in the browser.

4. **LLM usage:** Always via backend (Edge Function or app backend), never direct API keys from the client. Document patterns for streaming and non-streaming.

---

## 3. Supabase Edge Functions – What to Document

### 3.1 When to use Edge Functions

- **Use Edge when:** Calling LLMs (OpenAI, Anthropic, etc.), calling third-party APIs with secrets, webhooks, cron jobs, heavy compute, or any logic that must not expose keys or run in the browser.
- **Use client when:** CRUD via Supabase client (with RLS), Realtime, Storage uploads/downloads, Auth.

### 3.2 Patterns to add to docs

- **Creation:** `supabase functions new <name>`; project layout `supabase/functions/<name>/index.ts`.
- **Runtime:** Deno; env via `Deno.env.get('SUPABASE_*')` and custom secrets.
- **Invocation from app:** `supabase.functions.invoke('function-name', { body: payload })` with typed request/response.
- **Auth:** Passing `Authorization: Bearer <session.access_token>` or using service role inside Edge when appropriate.
- **Error handling and timeouts:** How to surface Edge errors to the UI (e.g. React Query, toasts).

### 3.3 Where to document

- **REACT_BOILERPLATE.md:** New subsection “Supabase and Edge Functions” (when Supabase is used): client setup, when to use Edge vs client, one minimal Edge example (e.g. “hello” or a simple proxy).
- **MODERN_STACK_QUICK_REFERENCE.md:** Short “Edge Functions” bullet: when to use, one-line invoke example, link to full guide.
- **API_LAYER_GUIDE.md:** New section “API layer with Supabase”: client for DB/Realtime/Storage; Edge as “backend API” for sensitive or server-only logic; same React Query / hooks patterns on top.

---

## 4. Modern LLM APIs – What to Document

### 4.1 Principles

- **No client-side API keys:** All LLM calls go through the app backend or Supabase Edge Functions.
- **Modern SDKs:** Prefer official SDKs (e.g. `openai`, `@anthropic-ai/sdk`) in Edge/server; document version and usage pattern.
- **Streaming:** Document streaming (SSE) from Edge to client and how the front-end consumes it (e.g. `ReadableStream`, React state, or a small hook).

### 4.2 Patterns to add

- **Edge Function as LLM proxy:**
  - Request: `{ messages, model?, stream? }` (or similar).
  - Edge: validate input, call OpenAI/Anthropic/etc. with API key from secrets, return JSON or stream.
  - Client: `supabase.functions.invoke('llm-proxy', { body })` and handle stream if applicable.
- **Structured output / tool use:** Optional subsection for agents (e.g. JSON mode, function calling) and where that runs (Edge only).
- **Error handling and rate limits:** How to map provider errors to user-facing messages and retries.

### 4.3 Where to document

- **REACT_BOILERPLATE.md:** New subsection “LLM and AI (via Edge / backend)”: principle (no keys in client), one Edge LLM proxy example (non-streaming first), then optional streaming snippet. List recommended SDKs and env (e.g. `OPENAI_API_KEY` in Edge secrets only).
- **MODERN_STACK_QUICK_REFERENCE.md:** “LLM / AI” bullet: “Always via Edge Function or backend; never expose API keys in client”; one-line invoke example.
- **API_LAYER_GUIDE.md:** New subsection under Supabase: “LLM and external APIs”: call Edge from a hook (e.g. `useLLM` or `useChat`), same error/toast patterns as rest of API layer.

---

## 5. Doc-by-Doc Improvement Plan

### 5.1 REACT_BOILERPLATE.md

| # | Change | Purpose |
|---|--------|---------|
| 1 | Resolve animation rule with MODERN_STACK_QUICK_REFERENCE (see §2) and state single rule here | Avoid conflicting instructions in prompts |
| 2 | Add “Supabase and Edge Functions” section: when to use client vs Edge, client init, one Edge example, `supabase.functions.invoke` from app | Modern backend option and performance (offload to edge) |
| 3 | Add “LLM and AI (via Edge / backend)” section: no client keys, Edge proxy example, optional streaming, recommended SDKs | Modern LLM usage and security |
| 4 | In “API Layer with Native Fetch”, add note: “When Supabase is used, also use Supabase client for DB/Auth/Realtime/Storage; use Edge or backend for LLM and secrets” | Clarify fetch vs Supabase vs Edge |
| 5 | Optional: Short “Performance” subsection: Edge for heavy work, streaming where applicable, React Query defaults | Better performance guidance |
| 6 | Keep existing Tailwind/shadcn/Recharts/Sonner content; only add references to new sections where relevant | Minimal churn, clear additions |

### 5.2 MODERN_STACK_QUICK_REFERENCE.md

| # | Change | Purpose |
|---|--------|---------|
| 1 | Align “Golden Rules” with REACT_BOILERPLATE: either “Tailwind CSS animations (no Motion)” or “Motion library” per §2 | Single source of truth for animations |
| 2 | Align API client: “Native fetch() in src/lib/api.ts” (or Axios if §2 chooses Axios); update snippets to match | Consistency with REACT_BOILERPLATE and API_LAYER_GUIDE |
| 3 | Add “Supabase & Edge” rule: “When using Supabase: client for DB/Auth/Realtime/Storage; Edge for server-only logic and LLM.” One-line invoke example | Quick reference for Edge |
| 4 | Add “LLM / AI” rule: “Never expose LLM API keys in client; call Edge Function or backend.” One-line example | Security and modern LLM |
| 5 | Update Pre-Flight Checklist and Common Mistakes to match animation and API client decisions | Consistency |
| 6 | Update package.json essentials: remove or add Motion per §2; add @supabase/supabase-js when Supabase is default or optional | Accurate deps |

### 5.3 API_LAYER_GUIDE.md

| # | Change | Purpose |
|---|--------|---------|
| 1 | Choose canonical HTTP client (fetch vs Axios) per §2; if fetch, replace Axios examples with fetch-based client (or document both with a clear “preferred” path) | Consistency with REACT_BOILERPLATE and prompts |
| 2 | Add section “API layer with Supabase”: Supabase client for DB/Realtime/Storage/Auth; when to use Edge; file layout (e.g. `src/api/`, `src/integrations/supabase/`) | Modern data layer |
| 3 | Add “Edge Functions as API”: invoke from hooks, type request/response, error handling, optional streaming (e.g. for LLM) | Edge as first-class API surface |
| 4 | Add “LLM and external APIs”: call Edge from a hook; no keys in client; same error/toast/cache patterns | Modern LLM integration |
| 5 | Keep existing REST/React Query patterns; present Supabase + Edge as an alternative or extension | Backward compatibility |

---

## 6. MCP Server Prompts (dist/server.js) – Prompt Updates

- **First prompt (boilerplate block):** After updating the three docs, no structural change is strictly required; the injected content will already reflect Edge and LLM. Optionally add one line to IMPLEMENTATION INSTRUCTIONS: “When Supabase is configured: use Edge Functions for LLM calls and server-only logic; never expose LLM or third-party API keys in the client.”
- **Subsequent prompt:** In “CRITICAL TECHNICAL REQUIREMENTS” or Supabase block, add: “Use Supabase Edge Functions for LLM and any server-only or secret-using logic.”
- **Supabase block (first vs subsequent):** Extend the existing Supabase instructions (in server) to mention: (1) Edge Functions for LLM and secrets, (2) `supabase.functions.invoke` from the app, (3) no client-side LLM API keys. Prefer a short, copy-pasteable line or two rather than duplicating the full doc content.

---

## 7. Implementation Order (when you implement)

1. **Decide §2** (animation + API client) and document in this plan or a short ADR.
2. **Update REACT_BOILERPLATE.md** (§5.1): alignment, then Supabase/Edge, then LLM.
3. **Update MODERN_STACK_QUICK_REFERENCE.md** (§5.2): alignment, then Supabase/Edge and LLM bullets.
4. **Update API_LAYER_GUIDE.md** (§5.3): canonical client, then Supabase + Edge + LLM sections.
5. **Update MCP server prompts** (§6): add Edge/LLM line(s) to first and subsequent prompts and Supabase block.
6. **Optional:** Add a single “QUICK_REFERENCE.md” in repo root that matches MODERN_STACK_QUICK_REFERENCE.md (or symlink) so “cursor-projects/…/QUICK_REFERENCE.md” can point to the same content if needed.

---

## 8. Success Criteria (for the plan)

- One consistent rule for animations and one for API client across REACT_BOILERPLATE, MODERN_STACK_QUICK_REFERENCE, and API_LAYER_GUIDE.
- Supabase Edge Functions are documented as the preferred way to run server-only logic and LLM calls.
- LLM usage is documented as “always via Edge or backend; no API keys in client” with at least one Edge proxy example.
- MCP directive prompts explicitly tell the agent to use Edge for LLM and secrets when Supabase is configured.
- Generated apps can follow the docs to build modern, performant flows using Edge Functions and modern LLM APIs without conflicting instructions.

---

*Document version: 1.0. Implementation applied (REACT_BOILERPLATE, MODERN_STACK_QUICK_REFERENCE, API_LAYER_GUIDE, server.ts prompts).*
