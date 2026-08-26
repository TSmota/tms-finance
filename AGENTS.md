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
  SQL das migrations as cita como `(RN-03.2)`; código TypeScript não cita, e o
  porquê está em ARCHITECTURE — Convenções de código.
- [ARCHITECTURE.md](ARCHITECTURE.md) — o *como* e o *porquê*: camadas,
  convenções, armadilhas já pagas. Leia "Superfície de agente" antes de tocar em
  `src/mcp/`, `src/lib/agent*.ts` ou `src/lib/deletionImpact.ts`.
- [prisma/schema.prisma](prisma/schema.prisma) — o modelo de dados: models,
  enums, índices e relações.
- `prisma/migrations/*/migration.sql` — as constraints `CHECK`. Elas **não**
  estão no schema: o Prisma Schema não as expressa, então são escritas à mão na
  migration, e o Prisma nem as gera nem as remove. `grep CHECK
  prisma/schema.prisma` não encontra invariante nenhuma e leva à conclusão
  errada de que não existem. Elas valem mais que qualquer coisa escrita fora do
  banco, e migration nova que mexa em invariante precisa trazer a sua.

Comentários e UI em pt-BR; identificadores e mensagens de commit em inglês.

## As cinco regras financeiras críticas

O porquê de cada uma está no ARCHITECTURE.

1. **Nunca use `number` do JS em operação monetária.** No servidor, use
   `Prisma.Decimal` através de `@/lib/money`. No cliente, onde `@/lib/money` não
   entra por ser server-only, use centavos inteiros — é o que
   `@/lib/installmentSplit` faz.
2. **Parcelamento:** uma regra de divisão, dois pontos de entrada. No servidor,
   `splitInstallments` de `@/lib/installments`, que valida o número de parcelas,
   o teto de `MAX_INSTALLMENTS` e o total mínimo — parcela de zero centavo o
   banco recusa — antes de delegar. Na prévia do formulário, `splitCents` de
   `@/lib/installmentSplit`, onde a aritmética mora e o único dos dois que entra
   no bundle do cliente. Chamar `splitCents` direto no servidor pula as três
   validações; reimplementar o arredondamento em qualquer um dos lados faz a
   prévia divergir do valor gravado.
3. **Fatura de cartão:** compra **depois** do `closingDay` entra na fatura do
   mês seguinte; no próprio dia do fechamento ainda entra na fatura corrente.
   Quando o dia não existe no mês, vale o último dia dele.
4. **Quitação de dívida:** toda transação com `debtId` atualiza o
   `remainingAmount` da `Debt` dentro do mesmo `prisma.$transaction`. Caso
   particular da regra 5.
5. **Atomicidade:** toda operação multi-passo (pagamento de fatura, criação de
   parcelas, amortização de dívida) usa `prisma.$transaction`.

## Onde as coisas moram

- **Validação:** [src/lib/validations.ts](src/lib/validations.ts) é fonte única,
  compartilhada pelo formulário e pelas ferramentas MCP de escrita. Campo novo
  num schema **muda a API do agente no mesmo commit** — e obriga o campo
  correspondente no DTO de [src/mcp/serializers.ts](src/mcp/serializers.ts),
  porque a trilha de auditoria não guarda o que a saída não expõe.
- **As três camadas:** `src/lib/<domínio>.ts` é o serviço e recebe `userId`
  explícito; `src/actions/<domínio>.ts` é casca fina (auth → zod → serviço →
  revalidate); `page.tsx` só lê. Campo novo entra no `data` de **cada** função
  de escrita — o `update` monta campo por campo, e esquecer um ali não quebra o
  typecheck.
- **Ferramenta MCP:** antes de criar uma, confira
  [src/mcp/scopes.ts](src/mcp/scopes.ts). É o inventário do que já existe e onde
  a ferramenta nova declara o escopo que exige.

## Antes de dar qualquer coisa por pronta

Este é o portão canônico. O [README](README.md) trata de subir e configurar o
projeto, não de o que precisa passar.

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Pare o `npm run dev` antes da suíte (ARCHITECTURE — Testes) e abra cada tela
nova no navegador: as armadilhas de ARCHITECTURE — Server Components são
invisíveis a esses quatro comandos.

Mexeu em UI? Rode também `npm run test:a11y` — axe-core em todas as rotas do app
contra WCAG 2.2 AA. Ele precisa do dev server no ar **e do banco com dados**
(ele recusa se as telas de detalhe não forem alcançáveis), então roda **depois**
dos quatro acima, não junto. O porquê de contraste não caber no Vitest está em
ARCHITECTURE — Testes.
