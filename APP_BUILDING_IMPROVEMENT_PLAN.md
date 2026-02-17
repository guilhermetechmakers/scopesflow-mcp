# App Building Improvement Plan

> **Created:** 2025-02-17  
> **Purpose:** Comprehensive plan to improve the quality of apps built by ScopesFlow + MCP, addressing design, functionality, Edge Functions, CRUD patterns, and Supabase authentication.

---

## Executive Summary

As ScopesFlow apps gain popularity, several gaps have been identified:

1. **Design** — Good but not perfect; needs stronger enforcement and consistency
2. **Functionality** — Not reaching full potential; features incomplete
3. **Edge Functions** — Not being created for features that require them
4. **CRUD Functions/Hooks** — Not consistently creating proper API layer and React Query hooks
5. **Authentication** — Not properly using Supabase Auth when Supabase is connected

This plan addresses improvements in **both** the MCP server (this repository) and the ScopesFlow application.

---

## Part 1: MCP Server Improvements

The MCP server is responsible for:
- Creating projects from boilerplate
- Executing prompts via Cursor Agent
- Injecting system prompts, design reference, and technical guidelines

### 1.1 Design Improvements

#### Current State
- `DESIGN_REFERENCE.md` and `DESIGN_RULES.md` exist with good patterns
- Design reference is injected into prompts
- Project-specific `Design_reference.md` is created from user prompt

#### Gaps
- Design quality varies; AI may not follow specifications strictly
- No explicit design quality checklist in prompts
- Inconsistent application of dark/light mode, typography, spacing
- `BUILD_GUIDE.md` conflicts with `REACT_BOILERPLATE.md` (e.g., Motion vs Tailwind animations)

#### Recommended Actions

| # | Action | Location | Priority |
|---|--------|----------|----------|
| 1 | Add **Design Quality Checklist** to first and subsequent prompts | `server.ts` | High |
| 2 | Strengthen design enforcement: "MUST follow Design Reference EXACTLY; no deviations without explicit permission" | `server.ts` prompts | High |
| 3 | Resolve **BUILD_GUIDE.md vs REACT_BOILERPLATE** conflict: Motion vs Tailwind. Choose one canonical source (REACT_BOILERPLATE says Tailwind) | `BUILD_GUIDE.md` | Medium |
| 4 | Add design validation reminders in subsequent prompts: "Before completing, verify: colors from Design Reference, typography scale, dark/light mode, spacing" | `server.ts` | Medium |
| 5 | Enhance `DESIGN_RULES.md` with more explicit "DO" and "DON'T" examples | `DESIGN_RULES.md` | Low |

**Design Checklist to Add:**
```
DESIGN VERIFICATION (before completing):
- [ ] All colors from Design Reference (no hardcoded hex/rgb)
- [ ] Typography matches specified scale
- [ ] Dark and light modes both implemented
- [ ] Spacing uses design system scale (4, 8, 16, 24, 32, 48, 64px)
- [ ] Animations match specified timing (200-300ms)
- [ ] Loading states use skeletons, not spinners
```

---

### 1.2 Edge Functions Improvements

#### Current State
- `REACT_BOILERPLATE.md` has a "Supabase and Edge Functions" section
- Supabase instructions mention: "Use Edge Functions for LLM and server-only logic"
- No explicit instruction to **create** Edge Functions when features require them

#### Gaps
- AI is told to *use* Edge Functions but not *when to create* them
- No feature-to-Edge-Function mapping in prompts
- Prompts don't say: "For feature X, create Edge Function Y"

#### Recommended Actions

| # | Action | Location | Priority |
|---|--------|----------|----------|
| 1 | Add **Edge Function Decision Matrix** to prompts when Supabase is configured | `server.ts` | High |
| 2 | Create `EDGE_FUNCTIONS_GUIDE.md` with: when to create, naming, structure, invoke pattern | New file | High |
| 3 | Add to Supabase instructions: "For each feature requiring: LLM calls, third-party APIs with secrets, webhooks, cron jobs, or heavy compute — CREATE a Supabase Edge Function. Use supabase functions new <name>" | `server.ts` | High |
| 4 | Include Edge Function creation in IMPLEMENTATION INSTRUCTIONS for first prompt | `server.ts` | Medium |
| 5 | Add example: "Example: If the app needs AI chat, create supabase/functions/llm-proxy/index.ts and invoke from a useChat hook" | `REACT_BOILERPLATE.md` or new guide | Medium |

**Edge Function Decision Matrix to Add:**
```
CREATE EDGE FUNCTION WHEN:
- LLM/AI features (chat, completions, embeddings) → llm-proxy or feature-specific
- Third-party APIs (Stripe, SendGrid, etc.) → api-proxy or {service}-webhook
- Webhooks (incoming) → webhook-{event}
- Cron/scheduled tasks → cron-{task}
- Heavy computation or server-only logic → {feature}-processor

DO NOT use Edge for: CRUD, Auth, Realtime, Storage — use Supabase client directly.
```

---

### 1.3 CRUD Functions and Hooks Improvements

#### Current State
- `API_LAYER_GUIDE.md` has fetch-based and Supabase patterns
- `SUPABASE_API_EXAMPLES.md` has complete CRUD + hooks examples
- First prompt injects API_LAYER_GUIDE

#### Gaps
- Prompts don't explicitly say: "For each entity (e.g., projects, tasks), create: api/{entity}.ts, hooks/use{Entity}.ts with useQuery/useMutation"
- AI may build UI without proper data layer
- No mandatory CRUD checklist when entities are defined in scope

#### Recommended Actions

| # | Action | Location | Priority |
|---|--------|----------|----------|
| 1 | Add **CRUD Mandate** to first prompt when Supabase is configured: "For each data entity in the requirements, you MUST create: (1) src/api/{entity}.ts with Supabase queries, (2) src/hooks/use{Entity}.ts with useQuery and useCreate/useUpdate/useDelete mutations" | `server.ts` | High |
| 2 | Add to subsequent prompts: "When adding new entities or features with data, create corresponding API module and React Query hooks following API_LAYER_GUIDE and SUPABASE_API_EXAMPLES" | `server.ts` | High |
| 3 | Ensure `API_LAYER_GUIDE.md` Supabase section is prominent and matches `SUPABASE_API_EXAMPLES.md` | `API_LAYER_GUIDE.md` | Medium |
| 4 | Add CRUD checklist to IMPLEMENTATION INSTRUCTIONS: "For entities [list from prompt]: create api + hooks" | `server.ts` (could parse prompt for entities) | Medium |

**CRUD Mandate to Add:**
```
CRUD REQUIREMENTS (when Supabase is configured):
For each data entity (e.g., projects, tasks, users):
1. Create src/api/{entity}.ts with: getAll, getById, create, update, delete
2. Create src/hooks/use{Entity}.ts with: use{Entities}(), use{Entity}(id), useCreate{Entity}(), useUpdate{Entity}(), useDelete{Entity}()
3. Use React Query for caching, invalidation, optimistic updates
4. Follow patterns in SUPABASE_API_EXAMPLES.md
```

---

### 1.4 Authentication Improvements

#### Current State
- `API_LAYER_GUIDE.md` has **two** auth patterns: (1) generic fetch + localStorage, (2) Supabase Auth
- `SUPABASE_INTEGRATION.md` and `SUPABASE_API_EXAMPLES.md` have proper Supabase Auth
- When Supabase is configured, prompts say "Follow Supabase best practices for auth" but don't explicitly forbid generic auth

#### Gaps
- AI may use generic fetch + localStorage auth even when Supabase is connected
- No explicit: "Use supabase.auth.signInWithPassword, NOT a custom /auth/login API"
- First prompt may not include Supabase instructions (need to verify)

#### Recommended Actions

| # | Action | Location | Priority |
|---|--------|----------|----------|
| 1 | **Add supabaseInstructions to first prompt** — CONFIRMED: supabaseInstructions is built for first prompt (lines 1791-1810) but NEVER interpolated into the first prompt block. Only line 17 mentions Supabase. Add `${supabaseInstructions}` to the first prompt when hasSupabase, before IMPLEMENTATION INSTRUCTIONS | `server.ts` | High |
| 2 | Add explicit auth mandate: "When Supabase is configured: Use Supabase Auth (supabase.auth.signInWithPassword, signUp, signOut, etc.). Do NOT use generic fetch + localStorage auth. Create AuthProvider/useAuth that wraps supabase.auth" | `server.ts` | High |
| 3 | Update `API_LAYER_GUIDE.md` to clearly state: "When Supabase is used, auth MUST use Supabase Auth. The generic auth pattern is for non-Supabase backends only." | `API_LAYER_GUIDE.md` | Medium |
| 4 | Add Auth setup to first-prompt Supabase instructions: "Create src/contexts/AuthContext.tsx using supabase.auth.getSession and onAuthStateChange" | `server.ts` | Medium |

**Auth Mandate to Add:**
```
AUTHENTICATION (when Supabase is configured):
- USE: supabase.auth.signInWithPassword, signUp, signOut, getSession, onAuthStateChange
- USE: AuthProvider/useAuth pattern wrapping Supabase auth state
- DO NOT: Create custom /auth/login API or localStorage token auth
- DO NOT: Use generic api.post('/auth/login') when Supabase is connected
```

---

### 1.5 Boilerplate and Prompt Consistency

#### Current State
- `PROMPTS_AND_DOCS_MODERNIZATION_PLAN.md` already identified conflicts
- Decisions: Tailwind animations (no Motion), native fetch (no Axios)
- Some files still conflict (e.g., BUILD_GUIDE.md uses Motion, axios)

#### Recommended Actions

| # | Action | Location | Priority |
|---|--------|----------|----------|
| 1 | Align `BUILD_GUIDE.md` with `REACT_BOILERPLATE.md`: Tailwind animations, native fetch | `BUILD_GUIDE.md` | Medium |
| 2 | Add `@supabase/supabase-js` to REACT_BOILERPLATE dependencies when Supabase is default or optional | `REACT_BOILERPLATE.md` | Low |
| 3 | Ensure MODERN_STACK_QUICK_REFERENCE matches REACT_BOILERPLATE (no Motion, fetch) | `MODERN_STACK_QUICK_REFERENCE.md` | Medium |

---

### 1.6 MCP Implementation Order

1. **Phase 1 (High Priority)**
   - Add supabaseInstructions to first prompt when Supabase configured
   - Add Auth mandate (Supabase Auth only when Supabase connected)
   - Add CRUD mandate for entities
   - Add Edge Function decision matrix and creation instructions

2. **Phase 2 (Medium Priority)**
   - Add Design Quality Checklist
   - Create EDGE_FUNCTIONS_GUIDE.md
   - Resolve BUILD_GUIDE / MODERN_STACK conflicts
   - Strengthen design enforcement in prompts

3. **Phase 3 (Low Priority)**
   - Enhance DESIGN_RULES.md
   - Add design validation reminders
   - Optional: Parse prompt for entities to auto-generate CRUD checklist

---

## Part 2: ScopesFlow Application Improvements

The ScopesFlow app is responsible for:
- Project creation and configuration
- Scope definition and scope items
- Prompt generation (via `generate-next-prompt` edge function)
- Build orchestration and UI

**Note:** If the ScopesFlow codebase is in a different repository, these improvements should be applied there. The MCP server receives prompts from ScopesFlow; improving prompt quality at the source will yield better results.

### 2.1 Prompt Generation Improvements

#### Current State
- `generate-next-prompt` edge function creates prompts based on project scope
- Prompts are stored in `flowchart_items` and executed by MCP

#### Gaps
- Generated prompts may not include explicit CRUD requirements
- Generated prompts may not request Edge Functions when features need them
- Generated prompts may not specify authentication requirements
- Design requirements in prompts may be generic

#### Recommended Actions

| # | Action | Location | Priority |
|---|--------|----------|----------|
| 1 | Enhance `generate-next-prompt` to include **CRUD requirements** when scope items define entities: "Create api/{entity}.ts and hooks/use{Entity}.ts with full CRUD" | ScopesFlow edge function | High |
| 2 | Add **Edge Function hints** to prompt generation: When scope includes "AI chat", "LLM", "webhook", "email", "payment" — add "Create Supabase Edge Function for [feature]" to prompt | ScopesFlow edge function | High |
| 3 | Add **Auth requirements** to prompts when project scope includes "user accounts", "login", "authentication": "Use Supabase Auth (supabase.auth.signInWithPassword, etc.). Do not use generic auth." | ScopesFlow edge function | High |
| 4 | Improve **design specificity** in generated prompts: Include color palette, typography, layout from project's ui_style_description or design config | ScopesFlow | Medium |
| 5 | Add **technical checklist** to each generated prompt: "This implementation must include: [list based on scope]" | ScopesFlow | Medium |

---

### 2.2 Scope Definition Improvements

#### Current State
- Users define scope items in ScopesFlow
- Scope items may be high-level (e.g., "Dashboard") or specific (e.g., "Task CRUD")

#### Gaps
- Scope may not capture "needs auth", "needs Edge Function", "needs CRUD"
- No structured way to tag scope items with technical requirements

#### Recommended Actions

| # | Action | Location | Priority |
|---|--------|----------|----------|
| 1 | Add **technical tags** to scope items: "requires-auth", "requires-edge-function", "requires-crud", "requires-realtime" | ScopesFlow schema + UI | High |
| 2 | When user adds "User authentication" or "Login" — auto-tag with requires-auth | ScopesFlow | Medium |
| 3 | When user adds "AI chat" or "Email notifications" — auto-tag with requires-edge-function | ScopesFlow | Medium |
| 4 | Pass these tags to `generate-next-prompt` so prompts include explicit technical requirements | ScopesFlow | High |

---

### 2.3 Project Configuration Improvements

#### Current State
- Projects can connect to Supabase
- Supabase URL and keys are passed to MCP for build

#### Gaps
- May not clearly communicate "this project uses Supabase" to prompt generation
- Design preferences (ui_style_description) may not be rich enough

#### Recommended Actions

| # | Action | Location | Priority |
|---|--------|----------|----------|
| 1 | Ensure design config (ui_style_description, design_reference) is passed to prompt generation and included in generated prompts | ScopesFlow | Medium |
| 2 | Add project-level flags: "Use Supabase Auth", "Use Edge Functions for AI" — these influence prompt generation | ScopesFlow | Low |
| 3 | Provide a **design template** or wizard for users to pick: "Dashboard", "Landing", "SaaS" — each with pre-filled design specs | ScopesFlow | Low |

---

### 2.4 ScopesFlow Implementation Order

1. **Phase 1**
   - Enhance generate-next-prompt with CRUD, Edge Function, Auth requirements
   - Add technical tags to scope items (or derive from scope text)

2. **Phase 2**
   - Improve design specificity in generated prompts
   - Add technical checklist to prompts

3. **Phase 3**
   - Scope item UI for technical tags
   - Project-level configuration flags
   - Design template wizard

---

## Part 3: Model and Prompt Strategy

### 3.1 Should We Change the Model?

**Considerations:**
- Different models have different strengths (e.g., Claude for code, GPT for reasoning)
- Model switching adds complexity but may improve quality
- Cost and latency vary by model

**Recommendation:** 
- **First:** Improve prompts and system instructions (MCP + ScopesFlow). This has the highest ROI and is model-agnostic.
- **Second:** If quality plateaus after prompt improvements, consider:
  - A/B testing models (e.g., sonnet-4.5 vs gpt-5 vs opus-4.1)
  - Using a stronger model for first prompt (complex setup) and lighter model for subsequent prompts
  - Per-project model preference (already supported via `model` in config)

### 3.2 Prompt Engineering Priorities

1. **Explicit instructions** — "Create X" beats "Consider X"
2. **Checklists** — "Before completing, verify: A, B, C"
3. **Negative instructions** — "Do NOT use X when Y"
4. **Examples** — "Example: For feature Z, create..."
5. **Reference consistency** — All docs must agree (no conflicting instructions)

---

## Part 4: Summary Checklist

### MCP Server (this repo)

- [x] Add supabaseInstructions to first prompt when Supabase configured *(implemented 2025-02-17)*
- [x] Add Auth mandate (Supabase Auth only when Supabase connected)
- [x] Add CRUD mandate for entities
- [x] Add Edge Function decision matrix and creation instructions
- [x] Create EDGE_FUNCTIONS_GUIDE.md
- [ ] Add Design Quality Checklist to prompts
- [ ] Resolve BUILD_GUIDE / MODERN_STACK conflicts
- [ ] Update API_LAYER_GUIDE auth section for Supabase-first

### ScopesFlow App

- [ ] Enhance generate-next-prompt with CRUD, Edge Function, Auth requirements
- [ ] Add technical tags to scope items
- [ ] Improve design specificity in generated prompts
- [ ] Pass design config to prompt generation

### Documentation

- [ ] Single source of truth for animations (Tailwind, no Motion)
- [ ] Single source of truth for API client (native fetch)
- [ ] Supabase Auth as default when Supabase connected
- [ ] Edge Functions as required for LLM/server-only features

---

## Appendix: Key Files Reference

| File | Purpose |
|------|---------|
| `server.ts` | MCP prompt building, create-project, execute-prompt |
| `build-runner.ts` | Build loop, prompt execution |
| `REACT_BOILERPLATE.md` | Main tech stack and patterns |
| `API_LAYER_GUIDE.md` | API layer, Supabase, hooks |
| `SUPABASE_API_EXAMPLES.md` | Complete Supabase CRUD + auth examples |
| `SUPABASE_INTEGRATION.md` | Supabase setup guide |
| `DESIGN_REFERENCE.md` | Universal design patterns |
| `DESIGN_RULES.md` | Design rules (dark/light, etc.) |
| `PROJECT_PROMPT_GUIDE.md` | How to structure prompts |

---

*Document version: 1.1. Part 1 MCP implemented 2025-02-17. See SCOPESFLOW_IMPROVEMENT_PLAN.md for ScopesFlow conceptual plan.*
