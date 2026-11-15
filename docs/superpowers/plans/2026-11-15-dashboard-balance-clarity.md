# Dashboard Balance Metrics Clarity & Terminology Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the primary metrics cards on `/dashboard` and `/dashboard/accounts` to prioritize immediate available liquidity ("Saldo em contas") over uncollected debts, providing transparent and conservative balance projections.

**Architecture:** Use existing `projection.currentBalance` from `getBalanceProjection` for Card 1 on the dashboard, eliminating the distortion caused by uncertain third-party receivables. Clarify Card 2's hint for projected month-end balance, and harmonize the accounts page heading from "Patrimônio líquido total em contas" to "Saldo total em contas".

**Tech Stack:** Next.js 16 (App Router), React Server Components, Mantine UI v7, TypeScript, Vitest.

**Spec:** [revisao_completa_portal_tms_finance.md](file:///home/thiago_mota/.gemini/antigravity/brain/177aaafc-98c6-4f52-912f-3e1df220fb7c/revisao_completa_portal_tms_finance.md)

## Global Constraints

- Never use JS `number` for monetary operations; use `money()` and `Prisma.Decimal`.
- UI text and comments in pt-BR; commit messages and code identifiers in English.
- No Server Component to Client Component serialization violations (no passing React functions/components as props across the RSC boundary).
- Pass canonical quality gate: `npm run typecheck && npm run lint && npm test && npm run build`.

## Review Focus

- Immediate liquidity accuracy: Card 1 must strictly reflect confirmed account balances in the user's base currency without including uncollected debts.
- Projection clarity: Card 2 must clearly state its formula (accounts + pending income - pending expenses - open card invoices).
- Consistency across views: `/dashboard/accounts` must not refer to account balances as "Patrimônio líquido".
- Multi-currency completeness warning: If FX rates are missing, partial calculation notes and warnings must remain visible.
- Preserving MCP compatibility: Keep `getNetWorth` service function for agent roadmap tools without breaking existing tests.

---

### Task 1: Update Dashboard Balance Cards (`/dashboard`)

**Files:**
- Modify: `src/app/dashboard/page.tsx:75-105`
- Test: `tests/integration/dashboardBalanceCards.test.ts`

- [x] **Step 1: Write integration/regression test for dashboard balance cards calculation**
  Create `tests/integration/dashboardBalanceCards.test.ts` verifying that `getBalanceProjection` provides `currentBalance` matching confirmed accounts without receivables, and that `netPosition` remains isolated in the third-party card.
- [x] **Step 2: Run test to verify it executes and passes**
  Run `npx vitest run tests/integration/dashboardBalanceCards.test.ts`.
- [x] **Step 3: Update `src/app/dashboard/page.tsx` Card 1 & Card 2**
  - Change Card 1 label to `"Saldo em contas"` and value to `formatCurrency(projection.currentBalance, user.baseCurrency)`.
  - Update hint to `"Disponível em contas correntes, carteiras e reservas"`.
  - Update note and warn to `projection.complete ? undefined : partial` and `!projection.complete`.
  - Refine Card 2 hint to `"Previsão para o fim do mês (contas + entradas − saídas e faturas)"`.
- [x] **Step 4: Verify typecheck, lint, and tests pass**
  Run `npm run typecheck && npm run lint && npx vitest run tests/integration/dashboardBalanceCards.test.ts`.
- [x] **Step 5: Commit changes**
  Commit with message `feat(dashboard): display immediate account balance and clarify projection`.

---

### Task 2: Harmonize Terminology on Accounts Page (`/dashboard/accounts`)

**Files:**
- Modify: `src/app/dashboard/accounts/page.tsx:40-56`
- Test: `tests/integration/accounts.test.ts`

- [x] **Step 1: Update Card title in `src/app/dashboard/accounts/page.tsx`**
  Change `"Patrimônio líquido total em contas"` to `"Saldo total em contas"`.
- [x] **Step 2: Run existing accounts tests**
  Run `npx vitest run tests/integration/accounts.test.ts`.
- [x] **Step 3: Commit changes**
  Commit with message `refactor(accounts): rename balance card to Saldo total em contas`.

---

### Task 3: Quality Gate Verification & Pull Request

**Files:**
- Entire repository

- [ ] **Step 1: Run full canonical test suite**
  Run `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 2: Push branch to remote**
  Run `git push -u origin refactor/dashboard-balance-cards`.
- [ ] **Step 3: Open PR and monitor CI checks**
  Open PR via `gh pr create` and watch checks with `gh pr checks <PR_NUMBER> --watch`.
- [ ] **Step 4: Merge PR once checks pass**
  Merge PR with `gh pr merge <PR_NUMBER> --squash --delete-branch`.
