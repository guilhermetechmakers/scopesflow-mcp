# ScopesFlow Improvement Plan (Conceptual)

> **Purpose:** Conceptual improvements for the ScopesFlow application to produce higher-quality built apps. No implementation details or specific code references—concepts only.

---

## 1. Prompt Generation

### 1.1 Enrich Generated Prompts with Technical Requirements

**Concept:** When the system generates prompts from project scope, each prompt should explicitly include the technical requirements needed for that feature.

**Improvements:**
- **Data layer requirements** — When scope defines entities (e.g., projects, tasks, users), generated prompts should explicitly request creation of the full data layer: API module and React Query hooks for each entity.
- **Server-side requirements** — When scope includes features that need server-only logic (AI, webhooks, third-party APIs, heavy compute), generated prompts should explicitly request creation of Edge Functions.
- **Authentication requirements** — When scope includes user accounts, login, or auth, generated prompts should explicitly require Supabase Auth (not generic auth).

### 1.2 Improve Design Specificity

**Concept:** Generated prompts should carry enough design context to produce consistent, high-quality UI.

**Improvements:**
- Pass project design preferences (colors, typography, layout) into prompt generation.
- Include design tokens or style descriptors in each generated prompt when available.
- Reduce generic design language; favor concrete specifications.

### 1.3 Add Technical Checklist to Prompts

**Concept:** Each generated prompt should end with a verification checklist based on the scope.

**Improvements:**
- Derive a list of "this implementation must include" items from the scope.
- Append to each prompt so the builder knows exactly what to deliver.
- Examples: "Must include: auth flow, project CRUD, dashboard layout."

---

## 2. Scope Definition

### 2.1 Technical Tags for Scope Items

**Concept:** Scope items can carry metadata that indicates what kind of technical work they require.

**Improvements:**
- Allow scope items to be tagged with technical requirements (e.g., requires auth, requires Edge Function, requires CRUD, requires realtime).
- Tags can be explicit (user selects) or inferred from scope text.
- Tags flow into prompt generation so prompts include the right mandates.

### 2.2 Auto-Detection of Technical Needs

**Concept:** When users describe scope in natural language, the system infers technical requirements.

**Improvements:**
- "User authentication" or "login" → tag as requires auth.
- "AI chat" or "email notifications" or "payment" → tag as requires Edge Function.
- "Task list" or "project management" → tag as requires CRUD.
- Use these inferences to enrich generated prompts.

### 2.3 Structured Scope Input

**Concept:** Guide users to define scope in a way that captures both features and technical needs.

**Improvements:**
- Optional structured fields: "Does this need auth?", "Does this need server-side logic?"
- Templates: "Dashboard app", "Landing page", "SaaS with auth" — each pre-fills common requirements.
- Reduce ambiguity so prompt generation has clear inputs.

---

## 3. Project Configuration

### 3.1 Design Configuration Flow

**Concept:** Projects should have a clear path to define and store design preferences.

**Improvements:**
- Ensure design config (style, colors, typography) is stored and passed to prompt generation.
- Provide simple design presets or wizards.
- Make design config visible and editable so users can refine before building.

### 3.2 Backend and Feature Flags

**Concept:** Project-level settings that influence how prompts are generated.

**Improvements:**
- Flags such as "Use Supabase Auth", "Use Edge Functions for AI" — when set, prompt generation includes corresponding mandates.
- Backend connection (e.g., Supabase) should be clearly indicated so prompts assume the right stack.
- Avoid building for a backend that is not connected.

---

## 4. Build Orchestration

### 4.1 Prompt Ordering and Dependencies

**Concept:** Prompts should be ordered so foundational work (auth, data layer) comes before dependent features.

**Improvements:**
- Ensure auth and base CRUD are built early when required.
- Order prompts so dependencies (e.g., "tasks" after "projects") are respected.
- Avoid building UI that depends on missing data or auth.

### 4.2 Feedback Loop

**Concept:** Use build results to improve future prompt generation.

**Improvements:**
- Track which prompts succeed or fail.
- Identify patterns: e.g., "CRUD prompts without explicit API/hook requirements often fail."
- Adjust prompt generation rules based on outcomes.

---

## 5. User Experience

### 5.1 Scope Guidance

**Concept:** Help users write scope that leads to better prompts.

**Improvements:**
- Inline hints: "Adding 'user login' will enable Supabase Auth."
- Examples of good scope descriptions.
- Suggestions when scope seems incomplete (e.g., "You mentioned tasks—do you need a task list CRUD?").

### 5.2 Transparency

**Concept:** Users should understand what will be built.

**Improvements:**
- Preview generated prompts before build starts.
- Show what technical requirements were inferred from scope.
- Allow users to edit or refine prompts when needed.

---

## 6. Summary of Concepts

| Area | Key Concept |
|------|-------------|
| **Prompt generation** | Enrich prompts with CRUD, Edge Function, and auth requirements; improve design specificity; add technical checklists |
| **Scope definition** | Add technical tags; auto-detect requirements; offer structured input |
| **Project configuration** | Design config flow; backend/feature flags; clear Supabase connection |
| **Build orchestration** | Order prompts by dependencies; use feedback to improve |
| **User experience** | Scope guidance; transparency; prompt preview |

---

*Document version: 1.0. Conceptual only—no implementation details.*
