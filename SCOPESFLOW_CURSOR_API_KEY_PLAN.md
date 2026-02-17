# ScopesFlow — Cursor API Key Integration Plan

> **Created:** 2026-02-17
> **Purpose:** Detailed implementation plan for the ScopesFlow app to collect, store, and manage per-user Cursor API keys so each user spends their own Cursor quota during automated builds.

---

## Summary

ScopesFlow must allow users to **add their own Cursor API key** in a settings screen, store it securely in Supabase (encrypted at rest), and enforce its presence before allowing builds. The MCP worker reads the key from the DB at build start — the ScopesFlow app never sends the plaintext key to the MCP.

**What the MCP server already provides (implemented):**
- `cursor_api_keys` table + RLS policies + `cursor_api_key_status` view (migration ready)
- `build-runner.ts` fetches the key by `user_id` at build start
- `server.ts` injects `CURSOR_API_KEY` into each `cursor-agent` process
- Worker session isolation (`build-worker.ts`) for per-build logs
- `MCP_REQUIRE_CURSOR_API_KEY=true` flag to enforce key presence

**What the ScopesFlow app needs (this plan):**
- Settings UI for key management
- Edge Function for secure key storage
- Edge Function (or RPC) for key status/revoke
- Build-start preflight check
- Zod validation
- Service layer integration

---

## Scope

### In scope
- Settings UI: add/update/revoke Cursor API key
- Supabase Edge Functions: `cursor-api-key-upsert`, `cursor-api-key-revoke`, `cursor-api-key-status`
- Client-side Zod validation
- Build-start preflight: block builds when key is missing/revoked
- Toast feedback and loading states

### Out of scope
- Cursor API key billing/usage dashboard (future)
- Admin panel for managing other users' keys
- Automatic key validation against Cursor's API (we trust the user's input)

---

## Prerequisites

### Database migration
The migration `supabase/migrations/20260217210000_create_cursor_api_keys.sql` must be applied to the Supabase project first. It creates:
- `cursor_api_keys` table (user_id, api_key_ciphertext, key_fingerprint, timestamps, revoked_at)
- RLS policies (users see/manage only their own row)
- `cursor_api_key_status` view (safe metadata without ciphertext)

### Environment secrets (Supabase Edge Functions dashboard)
- `CURSOR_KEYS_ENCRYPTION_SECRET` — a 32+ char random string used for AES-GCM encryption of keys. Generate with: `openssl rand -hex 32`

---

## Implementation Steps

### Step 1 — Zod schema for Cursor API key validation

**File:** `src/schemas/cursorApiKey.ts` (new)

```typescript
import { z } from 'zod';

export const cursorApiKeySchema = z.object({
  apiKey: z
    .string()
    .min(20, 'API key must be at least 20 characters')
    .max(500, 'API key is too long')
    .regex(/^\S+$/, 'API key must not contain spaces or newlines')
    .transform((val) => val.trim()),
});

export type CursorApiKeyInput = z.infer<typeof cursorApiKeySchema>;
```

---

### Step 2 — Supabase Edge Function: `cursor-api-key-upsert`

**File:** `supabase/functions/cursor-api-key-upsert/index.ts` (new)

**Purpose:** Accept plaintext key from the authenticated user, encrypt it, upsert into `cursor_api_keys`, and return safe metadata only.

**Behavior:**
1. Authenticate user via `Authorization: Bearer <JWT>` header
2. Parse and validate body: `{ apiKey: string }`
3. Compute `key_fingerprint`: first 6 chars + `...` + last 4 chars
4. Encrypt `apiKey` using AES-256-GCM with `CURSOR_KEYS_ENCRYPTION_SECRET`
   - Generate random 12-byte IV per encryption
   - Store as: `<base64(iv)>.<base64(ciphertext)>.<base64(authTag)>`
5. Upsert into `cursor_api_keys` for the authenticated user
6. Return: `{ hasKey: true, keyFingerprint: string, updatedAt: string }`

**Error responses:**
- `401`: missing/invalid JWT
- `400`: invalid apiKey (Zod validation)
- `500`: encryption or DB error

**Security:**
- NEVER log the plaintext key
- NEVER return the ciphertext to the client
- Use `createClient` with service role to bypass RLS for the upsert (the Edge Function verifies the user via JWT)

---

### Step 3 — Supabase Edge Function: `cursor-api-key-revoke`

**File:** `supabase/functions/cursor-api-key-revoke/index.ts` (new)

**Purpose:** Soft-revoke the user's key by setting `revoked_at = now()`.

**Behavior:**
1. Authenticate user
2. Update `cursor_api_keys` set `revoked_at = now()` where `user_id = auth.uid()`
3. Return: `{ hasKey: false }`

---

### Step 4 — Supabase Edge Function: `cursor-api-key-status`

**File:** `supabase/functions/cursor-api-key-status/index.ts` (new)

**Purpose:** Return key metadata (not ciphertext) for the current user.

**Behavior:**
1. Authenticate user
2. Query `cursor_api_key_status` view for `user_id = auth.uid()`
3. Return: `{ hasKey: boolean, keyFingerprint?: string, lastUsedAt?: string, createdAt?: string, revokedAt?: string }`

**Alternative:** This can also be done client-side by querying the `cursor_api_key_status` view directly (since RLS is on the underlying table). The Edge Function is recommended for consistency and to avoid exposing the view name to the client.

---

### Step 5 — Service layer: `cursorApiKeyService.ts`

**File:** `src/services/cursorApiKeyService.ts` (new)

**Purpose:** Encapsulate all Cursor API key operations behind a clean API.

```typescript
import { supabase } from '@/integrations/supabase/client';
import { cursorApiKeySchema } from '@/schemas/cursorApiKey';

export interface CursorApiKeyStatus {
  hasKey: boolean;
  keyFingerprint?: string;
  lastUsedAt?: string;
  createdAt?: string;
  revokedAt?: string;
}

/** Get the current user's Cursor API key status (safe metadata). */
export async function getCursorApiKeyStatus(): Promise<CursorApiKeyStatus> {
  const { data, error } = await supabase.functions.invoke('cursor-api-key-status');
  if (error) throw new Error(error.message);
  return data as CursorApiKeyStatus;
}

/** Save or update the user's Cursor API key (plaintext sent once, encrypted server-side). */
export async function upsertCursorApiKey(apiKey: string): Promise<CursorApiKeyStatus> {
  const validated = cursorApiKeySchema.parse({ apiKey });
  const { data, error } = await supabase.functions.invoke('cursor-api-key-upsert', {
    body: { apiKey: validated.apiKey },
  });
  if (error) throw new Error(error.message);
  return data as CursorApiKeyStatus;
}

/** Revoke the user's Cursor API key (future builds will fail until a new key is set). */
export async function revokeCursorApiKey(): Promise<CursorApiKeyStatus> {
  const { data, error } = await supabase.functions.invoke('cursor-api-key-revoke');
  if (error) throw new Error(error.message);
  return data as CursorApiKeyStatus;
}

/** Check if the user can start a build (has a valid, non-revoked key). */
export async function canStartBuild(): Promise<boolean> {
  try {
    const status = await getCursorApiKeyStatus();
    return status.hasKey;
  } catch {
    return false;
  }
}
```

---

### Step 6 — React Query hooks: `useCursorApiKey.ts`

**File:** `src/hooks/useCursorApiKey.ts` (new)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCursorApiKeyStatus,
  upsertCursorApiKey,
  revokeCursorApiKey,
} from '@/services/cursorApiKeyService';
import { toast } from 'sonner';

const QUERY_KEY = ['cursor-api-key-status'];

/** Fetch current key status. */
export function useCursorApiKeyStatus() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getCursorApiKeyStatus,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

/** Save/update key mutation. */
export function useUpsertCursorApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) => upsertCursorApiKey(apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Cursor API key saved successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save key: ${error.message}`);
    },
  });
}

/** Revoke key mutation. */
export function useRevokeCursorApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeCursorApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Cursor API key revoked');
    },
    onError: (error: Error) => {
      toast.error(`Failed to revoke key: ${error.message}`);
    },
  });
}
```

---

### Step 7 — Settings UI component: `CursorApiKeySettings`

**File:** `src/components/settings/CursorApiKeySettings.tsx` (new)

**UI structure:**
```
┌──────────────────────────────────────────────────┐
│  Cursor API Key                                   │
│  ─────────────────────────────────────────────── │
│                                                   │
│  [Status card]                                    │
│  ┌────────────────────────────────────────────┐  │
│  │  ✅ Configured                             │  │
│  │  Fingerprint: ck_12ab...9xyz               │  │
│  │  Last used: Feb 17, 2026 at 3:42 PM       │  │
│  │                          [Revoke] [Update] │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  OR (when not configured):                        │
│  ┌────────────────────────────────────────────┐  │
│  │  ⚠️ Not configured                         │  │
│  │  Add your Cursor API key to run builds     │  │
│  │  using your own quota.                     │  │
│  │                                   [Add Key]│  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  [Expandable: Add / Update key form]              │
│  ┌────────────────────────────────────────────┐  │
│  │  Cursor API Key  [🔒 ••••••••••••••] [👁]  │  │
│  │                                             │  │
│  │  Your key is encrypted and stored securely. │  │
│  │  It will never be shown again after saving. │  │
│  │                                             │  │
│  │                         [Cancel] [Save Key] │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ℹ️ How to get your Cursor API key:               │
│  1. Go to cursor.com/settings → API Keys          │
│  2. Create a new key                              │
│  3. Copy and paste it here                        │
└──────────────────────────────────────────────────┘
```

**Implementation notes:**
- Use Shadcn UI: `Card`, `Input`, `Button`, `Badge`, `Collapsible`
- Password-type input with reveal toggle (eye icon)
- Loading skeleton while fetching status
- Disable buttons during mutations (isPending)
- Never persist the plaintext key in state after successful save (clear the input)
- Use `react-hook-form` + `@hookform/resolvers/zod` + `cursorApiKeySchema`

---

### Step 8 — Integrate into Settings page

**File:** `src/pages/Settings.tsx` (or equivalent settings route)

**Changes:**
- Import and render `<CursorApiKeySettings />` in the Integrations section
- Place it alongside existing integrations (GitHub, Supabase)
- Tab label: "Cursor" or "API Keys"

---

### Step 9 — Build-start preflight check

**File:** `src/services/buildAutomationService.ts` (modify)

**Changes:**
- Before calling the Supabase Edge Function `build-automation-start`, check `canStartBuild()` from `cursorApiKeyService`
- If `false`, throw an error with a user-friendly message: "Add your Cursor API key in Settings to start builds."
- Show a toast with an action button that navigates to Settings

```typescript
// In startAutomatedBuild(), before storeBuildInDatabase:
import { canStartBuild } from '@/services/cursorApiKeyService';

const hasKey = await canStartBuild();
if (!hasKey) {
  throw new Error('Cursor API key required. Go to Settings → Integrations → Cursor to add your key.');
}
```

**Alternative location:** The check can also happen in the Edge Function `build-automation-start` (server-side enforcement). Both are recommended for defense in depth.

---

### Step 10 — Edge Function `build-automation-start` update

**File:** `supabase/functions/build-automation-start/index.ts` (modify)

**Changes:**
- After creating the build row and before calling the MCP, check `cursor_api_keys` for the authenticated user
- If missing or revoked, return an error: `{ error: 'Cursor API key not configured' }`
- This provides server-side enforcement even if the client-side check is bypassed

---

## Data / API Changes Summary

### New files in ScopesFlow
| File | Type | Purpose |
|------|------|---------|
| `src/schemas/cursorApiKey.ts` | Schema | Zod validation for API key input |
| `src/services/cursorApiKeyService.ts` | Service | Key CRUD operations via Edge Functions |
| `src/hooks/useCursorApiKey.ts` | Hook | React Query hooks for key status/mutations |
| `src/components/settings/CursorApiKeySettings.tsx` | Component | Settings UI for key management |

### New Supabase Edge Functions
| Function | Method | Purpose |
|----------|--------|---------|
| `cursor-api-key-upsert` | POST | Encrypt and store user's key |
| `cursor-api-key-revoke` | POST | Soft-revoke user's key |
| `cursor-api-key-status` | GET | Return safe key metadata |

### Modified files
| File | Change |
|------|--------|
| `src/pages/Settings.tsx` | Add `<CursorApiKeySettings />` |
| `src/services/buildAutomationService.ts` | Add preflight check |
| `supabase/functions/build-automation-start/index.ts` | Server-side key check |

### Supabase secrets to add
| Secret | Value |
|--------|-------|
| `CURSOR_KEYS_ENCRYPTION_SECRET` | `openssl rand -hex 32` |

---

## Testing / Validation

### Manual testing
1. **No key configured:** Open Settings → Cursor. Should show "Not configured" state.
2. **Add key:** Enter a key, save. Toast shows success. Status updates to "Configured" with fingerprint.
3. **Try to start build:** Should succeed (key exists).
4. **Revoke key:** Click Revoke. Status shows "Not configured".
5. **Try to start build after revoke:** Should be blocked with clear error message.
6. **Update key:** Add a new key after revoking. Should work.
7. **Edge Function errors:** Test with invalid JWT, empty key, key too short.

### Security verification
- After saving, the plaintext key should NOT be visible anywhere:
  - Not in browser devtools (localStorage, sessionStorage, cookies)
  - Not in Supabase `cursor_api_keys` table `api_key_ciphertext` column (should be encrypted blob)
  - Not in Edge Function logs
  - Not in network request responses (only fingerprint returned)

---

## UI/UX Considerations

### Loading states
- Skeleton loader for key status card on initial load
- Disabled "Save" button with spinner during mutation
- Disabled "Revoke" button with spinner during mutation

### Error states
- Invalid key format: inline Zod validation error below input
- Network error: toast with retry suggestion
- JWT expired: redirect to login

### Empty state
- Friendly illustration or icon
- Clear CTA: "Add your Cursor API key to get started"
- Link to Cursor's API key creation page

### Responsiveness
- Stack cards vertically on mobile
- Full-width input on mobile
- Touch-friendly buttons (44x44px min)

---

## Risks / Notes

- **Encryption key rotation:** If `CURSOR_KEYS_ENCRYPTION_SECRET` needs to change, all existing keys become unreadable. A migration script would be needed. Document this risk.
- **Key validation:** We don't validate the key against Cursor's API (no endpoint exists for that). Invalid keys will cause builds to fail at the `cursor-agent` step with a clear error.
- **Rate limiting:** Consider adding rate limiting to the Edge Functions to prevent abuse (e.g., max 10 upserts per hour per user).

---

## Rollout Plan

1. Apply the `cursor_api_keys` migration to Supabase
2. Deploy Edge Functions (`cursor-api-key-upsert`, `cursor-api-key-revoke`, `cursor-api-key-status`)
3. Add `CURSOR_KEYS_ENCRYPTION_SECRET` to Supabase secrets
4. Deploy ScopesFlow app with Settings UI + preflight check
5. Announce to users: "Add your Cursor API key in Settings"
6. After adoption period, enable `MCP_REQUIRE_CURSOR_API_KEY=true` on VPS to enforce

---

*Document version: 1.0*
