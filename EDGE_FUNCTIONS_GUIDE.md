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

Every project with Edge Functions **must** include the shared CORS module:

```
supabase/
└── functions/
    ├── _shared/
    │   └── cors.ts          ← required for every project
    └── <function-name>/
        └── index.ts
```

### Shared CORS Module (required)

Create `supabase/functions/_shared/cors.ts` before any Edge Function:

```ts
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};
```

### Minimal Example (Deno)

```ts
// supabase/functions/my-function/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    // ... function logic ...

    return new Response(
      JSON.stringify({ data: body }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

**Three mandatory patterns in every Edge Function:**

1. **Import `corsHeaders`** from `../_shared/cors.ts`
2. **Handle OPTIONS preflight** as the very first check — return immediately with `corsHeaders`
3. **Include `corsHeaders`** in every `Response` (success, error, and all status codes)

---

## Authentication Patterns

### Authenticated Endpoint (user-scoped)

Use when the function needs to know who the user is (e.g. user data, user-scoped operations).

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Pass the user's JWT through so RLS policies apply
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    // user.id is available; RLS policies are enforced on queries

    return new Response(
      JSON.stringify({ data: 'result' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Service-Only Endpoint (webhooks, cron, internal)

Use for webhooks, cron jobs, or functions called server-to-server where no user JWT is available. Requires `verify_jwt = false` in `config.toml`.

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Service role bypasses RLS — use only for trusted server-side operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    // ... function logic (no user context, full DB access) ...

    return new Response(
      JSON.stringify({ data: 'result' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## `config.toml` Configuration

Supabase verifies the JWT in the `Authorization` header **before** your function code runs. Control this per function in `supabase/config.toml`:

```toml
# supabase/config.toml

[functions.my-authenticated-function]
verify_jwt = true          # default — requires valid user JWT or anon key

[functions.stripe-webhook]
verify_jwt = false          # webhooks don't send a Supabase JWT

[functions.cron-cleanup]
verify_jwt = false          # cron/scheduled calls don't have user context
```

| `verify_jwt` | Use when | Authorization header |
|---|---|---|
| `true` (default) | User-facing endpoints called from the app via `supabase.functions.invoke()` | User JWT or anon key (sent automatically by the client) |
| `false` | Webhooks, cron jobs, server-to-server calls | Not required; validate payloads with your own logic (e.g. Stripe signature) |

If you get `{"code":401,"message":"Invalid JWT"}` on a webhook or cron function, set `verify_jwt = false` for that function.

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

1. Handles CORS preflight
2. Accepts `{ messages, model?, stream? }` from the client
3. Validates input
4. Calls OpenAI/Anthropic with server-side API key
5. Returns JSON or streams response

### Server-side (Edge Function)

```ts
// supabase/functions/llm-proxy/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages, model = 'gpt-4o-mini' } = await req.json();
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Client-side call

```ts
await supabase.functions.invoke('llm-proxy', { body: { messages, model: 'gpt-4o-mini' } });
```

For streaming, return a `ReadableStream` from the Edge Function and consume it in the client (e.g. with a hook that updates React state as chunks arrive).

---

## Error Handling

- Map provider errors to user-facing messages
- Return appropriate HTTP status codes
- **Always include `corsHeaders`** in error responses — omitting them causes the browser to hide the error
- Use same error handling patterns as rest of API layer (toasts, React Query)

---

## Best Practices

1. **Always create `_shared/cors.ts`** — First step when scaffolding Edge Functions
2. **Handle OPTIONS in every function** — Prevents `Invalid JWT` on browser preflight
3. **Pass `Authorization` header through** — Creates a user-scoped Supabase client with RLS
4. **Include `corsHeaders` in every response** — Success, error, and all status codes
5. **One Edge Function per concern** — e.g. `llm-proxy`, `stripe-webhook`, `send-email`
6. **Validate all input** — Never trust client input
7. **Keep functions focused** — Small, single-purpose functions
8. **Use typed request/response** — Define interfaces for body and return
9. **Never expose secrets** — API keys only in Edge or backend
10. **Configure `verify_jwt`** — Set `false` in `config.toml` for webhooks and cron

---

## Reference

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Runtime](https://deno.land/std@0.168.0/http/server.ts)
