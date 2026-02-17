# Supabase Edge Functions Guide

## Overview

Edge Functions run on Deno at the edge, close to users. Use them for server-only logic that must not run in the browser or that requires secrets (API keys, tokens).

---

## When to Create an Edge Function

### Create Edge Function When

| Feature Type | Example | Edge Function Purpose |
|--------------|---------|------------------------|
| **LLM/AI** | Chat, completions, embeddings | Proxy to OpenAI/Anthropic; keep API keys server-side |
| **Third-party APIs** | Stripe, SendGrid, Twilio | Proxy calls that need secrets |
| **Webhooks** | Incoming webhooks from external services | Handle and validate webhook payloads |
| **Cron/scheduled** | Daily reports, cleanup jobs | Run on schedule |
| **Heavy compute** | Image processing, PDF generation | Offload from client |

### Do NOT Use Edge For

| Feature Type | Use Instead |
|--------------|-------------|
| **CRUD** | Supabase client directly |
| **Auth** | `supabase.auth.*` |
| **Realtime** | `supabase.channel().on()` |
| **Storage** | `supabase.storage.*` |

---

## Decision Matrix

```
Feature requires LLM or AI?           → YES → Create Edge Function
Feature requires third-party API key? → YES → Create Edge Function
Feature is webhook receiver?          → YES → Create Edge Function
Feature is cron/scheduled?           → YES → Create Edge Function
Feature is heavy compute?             → YES → Create Edge Function
Feature is CRUD/Auth/Realtime/Storage?→ NO  → Use Supabase client
```

---

## Creation and Structure

### Create a New Function

```bash
supabase functions new <function-name>
```

### Project Layout

```
supabase/
└── functions/
    └── <function-name>/
        └── index.ts
```

### Minimal Example (Deno)

```ts
// supabase/functions/my-function/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const body = await req.json();
  // Validate input, call external API, etc.
  return new Response(JSON.stringify({ data: body }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## Invocation from the App

### Basic Invoke

```ts
const { data, error } = await supabase.functions.invoke('my-function', {
  body: { key: 'value' },
});
if (error) throw error;
```

### With Type Safety

```ts
// src/api/edge.ts
import { supabase } from '@/lib/supabase';

export const edgeApi = {
  invoke: async <TReq, TRes>(name: string, body: TReq): Promise<TRes> => {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw new Error(error.message);
    return data as TRes;
  },
};
```

### In a Hook

```ts
// src/hooks/useMyFeature.ts
import { useMutation } from '@tanstack/react-query';
import { edgeApi } from '@/api/edge';
import { toast } from 'sonner';

export const useMyFeature = () => {
  return useMutation({
    mutationFn: (input: MyInput) => edgeApi.invoke<MyInput, MyOutput>('my-function', input),
    onSuccess: () => toast.success('Done!'),
    onError: (e) => toast.error(e.message),
  });
};
```

---

## Environment and Secrets

- Use `Deno.env.get('SUPABASE_URL')` and `Deno.env.get('SUPABASE_ANON_KEY')` for Supabase
- Store API keys in Supabase secrets or env; never expose in client
- Access secrets via `Deno.env.get('OPENAI_API_KEY')` etc.

---

## LLM Proxy Pattern

For LLM/AI features, create an Edge Function that:

1. Accepts `{ messages, model?, stream? }` from the client
2. Validates input
3. Calls OpenAI/Anthropic with server-side API key
4. Returns JSON or streams response

```ts
// Client calls:
await supabase.functions.invoke('llm-proxy', { body: { messages, model: 'gpt-4o-mini' } });
```

---

## Error Handling

- Map provider errors to user-facing messages
- Return appropriate HTTP status codes
- Use same error handling patterns as rest of API layer (toasts, React Query)

---

## Best Practices

1. **One Edge Function per concern** — e.g. `llm-proxy`, `stripe-webhook`, `send-email`
2. **Validate all input** — Never trust client input
3. **Keep functions focused** — Small, single-purpose functions
4. **Use typed request/response** — Define interfaces for body and return
5. **Never expose secrets** — API keys only in Edge or backend

---

## Reference

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Runtime](https://deno.land/std@0.168.0/http/server.ts)
