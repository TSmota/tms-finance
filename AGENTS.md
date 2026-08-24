<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# TMS Finance — instruções para agentes

Vale para qualquer agente. Nenhuma ferramenta tem cópia própria destas regras:
`.claude/CLAUDE.md` importa este arquivo, porque o Claude Code lê `CLAUDE.md` e
não `AGENTS.md`.

## Fontes de verdade

- [docs/business-rules.md](docs/business-rules.md) — o domínio, RN-01 a RN-05. O
  código as cita como `(RN-03.2)`.
- [ARCHITECTURE.md](ARCHITECTURE.md) — o *como* e o *porquê*: camadas,
  convenções, armadilhas já pagas. Leia "Superfície de agente" antes de tocar em
  `src/mcp/`, `src/lib/agent*.ts` ou `src/lib/deletionImpact.ts`.
- [prisma/schema.prisma](prisma/schema.prisma) — o modelo de dados. Suas
  constraints `CHECK` valem mais que qualquer coisa escrita fora dele.

Comentários e UI em pt-BR; identificadores e mensagens de commit em inglês.

## As cinco regras financeiras críticas

O porquê de cada uma está no ARCHITECTURE.

1. **Nunca use `number` do JS em operação monetária.** No servidor, use
   `Prisma.Decimal` através de `@/lib/money`. No cliente, onde `@/lib/money` não
   entra por ser server-only, use centavos inteiros — é o que
   `@/lib/installmentSplit` faz.
2. **Parcelamento:** fonte única da divisão em `@/lib/installmentSplit`,
   consumida pelo servidor e pela prévia do formulário. Não reimplemente o
   arredondamento em nenhum dos dois lados.
3. **Fatura de cartão:** compra **depois** do `closingDay` entra na fatura do
   mês seguinte; no próprio dia do fechamento ainda entra na fatura corrente.
   Quando o dia não existe no mês, vale o último dia dele.
4. **Quitação de dívida:** toda transação com `debtId` atualiza o
   `remainingAmount` da `Debt` dentro do mesmo `prisma.$transaction`. Caso
   particular da regra 5.
5. **Atomicidade:** toda operação multi-passo (pagamento de fatura, criação de
   parcelas, amortização de dívida) usa `prisma.$transaction`.

## Antes de dar qualquer coisa por pronta

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Pare o `npm run dev` antes da suíte (ARCHITECTURE — Testes) e abra cada tela
nova no navegador: as armadilhas de ARCHITECTURE — Server Components são
invisíveis a esses quatro comandos.
