# CLAUDE.md

This file defines global rules for all agents working in this repository.
Keep it short. Detailed reference material lives in subdirectory CLAUDE.md files and skills.

---

## What we are building

A deterministic POS system for restaurants and cafés.
- Tablet-first PWA, multi-user with roles, offline-capable
- All transactional logic is explicit and reproducible
- No AI runtime decisions in the core engine

## Monorepo structure

```
/apps/web           # Next.js PWA (frontend)
/apps/api           # Supabase Edge Functions (Action API)
/packages/shared    # Shared TypeScript types
/supabase           # Migrations, seed, config
/docs               # Architecture and feature specs
```

Never create new top-level directories without human approval.

## Tech stack

| Layer      | Choice                      |
|------------|-----------------------------|
| Frontend   | Next.js + TypeScript        |
| Styling    | Tailwind CSS                |
| PWA        | next-pwa                    |
| Backend    | Supabase Edge Functions     |
| Database   | Postgres via Supabase       |
| Auth       | Supabase Auth               |
| E2E Tests  | Playwright                  |
| Unit Tests | Vitest                      |

Do not introduce any library not listed here without human approval.

## Code style

- TypeScript strict mode — no `any`
- All functions must have explicit return types
- No commented-out code in PRs
- No `console.log` in production code — use structured logging
- Every new function needs at least one unit test

## Agent authority

- You may open pull requests
- You may NOT merge pull requests
- Flag for human review before changing: RLS policies, audit logic, permissions
- Do not make architectural decisions not covered in this file or subdirectory CLAUDE.md files
