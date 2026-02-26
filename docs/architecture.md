# Architecture

> This document contains fixed architectural decisions that all agents must follow.
> Do not deviate from these decisions without explicit human approval.

---

## 1. System Overview

This is a deterministic Point of Sale (POS) system for restaurants and cafés.
All transactional logic is explicit, version-controlled, and reproducible.
AI agents develop the system. Humans approve all merges.

```
[ Web / Tablet PWA ]
        |
        v
[ Action API (Supabase Edge Functions) ]
        |
        v
[ Domain Engine (Deterministic Logic) ]
        |
        v
[ Supabase (Postgres + Auth + RLS) ]
```

---

## 2. Frontend

- **Framework:** Next.js (TypeScript)
- **Styling:** Tailwind CSS
- **PWA:** next-pwa (offline-first support)
- **Testing:** Playwright for E2E
- **Location:** `/apps/web`

### UI Guidelines

This is a functional tool used in fast-paced restaurant environments, not a marketing site.
Agents must prioritise:

- **Touch-first** — all interactive elements minimum 48×48px touch targets
- **High contrast** — text and buttons must be clearly readable in bright or dim environments
- **Large, legible typography** — minimum 16px body text, 20px+ for key actions
- **Minimal navigation depth** — operators must reach any screen in 2 taps or fewer
- **No decorative complexity** — prefer clarity over visual creativity
- **Tablet-optimised layout** — design for 10–12" screens in landscape orientation

---

## 3. Backend

- **Approach:** Supabase-first
- **Database:** Postgres via Supabase
- **Auth:** Supabase Auth
- **API:** Supabase Edge Functions (Action API)
- **Storage:** Supabase Storage (receipts, logos)
- **Location:** `/apps/api`

---

## 4. Database Rules

- All schema changes must be committed as migration files under `/supabase/migrations/`
- No schema changes via the Supabase dashboard
- RLS must be enabled on every table, even if policies are permissive during early development
- No direct client-side writes for sensitive operations — all mutations go through the Action API
- Audit logging is mandatory for all destructive actions

### Core Tables (MVP)

`restaurants`, `users`, `roles`, `tables`, `menus`, `menu_items`, `modifiers`,
`orders`, `order_items`, `payments`, `shifts`, `audit_log`

---

## 5. Action API

All state-changing operations are explicit edge functions. No exceptions.

| Action | Description |
|---|---|
| `create_order` | Opens a new order |
| `add_item_to_order` | Adds a menu item to an open order |
| `cancel_order` | Cancels an order with reason |
| `void_item` | Removes an item from an order |
| `close_order` | Finalises an order |
| `record_payment` | Records a payment against an order |
| `open_shift` | Opens a staff shift |
| `close_shift` | Closes a staff shift with summary |

Each action must:
1. Validate permissions
2. Validate state transitions
3. Emit an audit event
4. Return a structured result

---

## 6. Monorepo Structure

```
/apps/web          # Next.js PWA frontend
/apps/api          # Supabase edge functions (Action API)
/packages/shared   # Shared TypeScript types
/supabase          # Migrations, seed, config
/docs              # Architecture, feature specs, agent guides
```

---

## 7. Agent Authority Rules

- Agents may open pull requests
- Agents may not merge pull requests
- Human approval is required for:
  - Any schema migration
  - Any change to permissions or RLS policies
  - Any change to audit logic
  - Any production deployment

---

## 8. CI Gates (Required to Merge)

- Typecheck passes (`tsc --noEmit`)
- Lint passes (ESLint + Prettier)
- Unit tests pass (Vitest)
- Migration applies cleanly (`supabase db diff`)
- E2E tests pass (Playwright)

---

## 9. Deployment

| Environment | Trigger | Host |
|---|---|---|
| Local | `supabase start` | Local machine |
| Staging | Auto on merge to `main` | Vercel + Supabase |
| Production | Manual promotion | Vercel + Supabase |

---

## 10. Out of Scope (MVP)

- Integrated payment processing
- Hardware printer integration
- Advanced analytics or forecasting
- AI-driven autonomous decisions at runtime
- AI interface layer (planned for Phase 2)
