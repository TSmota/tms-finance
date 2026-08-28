<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## TMS Finance — instruções para agentes

Estas regras valem para qualquer agente.

### Fontes de verdade

- [docs/business-rules.md](docs/business-rules.md): o domínio, RN-01 a RN-05.
- [ARCHITECTURE.md](ARCHITECTURE.md): camadas, decisões e armadilhas. Leia
  "Superfície de agente" antes de alterar MCP, tokens, auditoria, rate limit ou
  `deletionImpact`.
- [prisma/schema.prisma](prisma/schema.prisma): models, enums, índices e
  relações.
- `prisma/migrations/*/migration.sql`: constraints `CHECK`, escritas à mão
  porque o Prisma Schema não as representa. Migration que altera uma invariante
  deve atualizar sua `CHECK`; ela prevalece sobre a documentação.

Comentários e UI em pt-BR; identificadores e mensagens de commit em inglês.

### As cinco regras financeiras críticas

1. **Nunca use `number` do JS em operação monetária.** No servidor, use
   `Prisma.Decimal` via `@/lib/money`; no cliente, use centavos inteiros como
   `@/lib/installmentSplit`.
2. **Parcelamento:** uma regra de divisão, dois pontos de entrada. No servidor,
   chame `splitInstallments`, que valida contagem, limite e total mínimo. Use
   `splitCents` apenas na prévia do cliente. Não reimplemente o arredondamento.
3. **Fatura de cartão:** compra **depois** do `closingDay` entra na fatura do
   mês seguinte; no próprio dia do fechamento ainda entra na fatura corrente.
   Quando o dia não existe no mês, vale o último dia dele.
4. **Quitação de dívida:** toda transação com `debtId` atualiza o
   `remainingAmount` da `Debt` na mesma transação.
5. **Atomicidade:** toda operação multi-passo (pagamento de fatura, criação de
   parcelas, amortização de dívida) usa `prisma.$transaction`.

### Onde as coisas moram

- **Validação:** [src/lib/validations.ts](src/lib/validations.ts) é fonte única,
  compartilhada por formulários e MCP. Campo novo muda a API do agente no mesmo
  commit e entra também em [src/mcp/serializers.ts](src/mcp/serializers.ts).
- **Camadas:** `src/lib/<domínio>.ts` contém o serviço com `userId` explícito;
  `src/actions/<domínio>.ts` faz auth → zod → serviço → revalidate; `page.tsx`
  só lê. Campo novo entra no `data` de **cada** escrita do serviço.
- **MCP:** confira [src/mcp/scopes.ts](src/mcp/scopes.ts) antes de criar uma
  ferramenta; ali ficam o inventário e os escopos.
- **Testes:** unitário ao lado do módulo (`src/**/*.test.ts`), integração em
  `tests/integration/` com o nome do serviço que exercita. Apoio em
  `tests/support/`, importado por `@tests/*`: fábrica escreve no banco, builder
  monta payload, `expectBalance` afirma as duas pontas do saldo. Não monte
  payload à mão nem afirme saldo lendo só `currentBalance`.
- **Procedimento por tarefa:** siga a skill correspondente em
  [.github/skills/](.github/skills/); ela aponta para as regras, não as duplica.

### Antes de dar qualquer coisa por pronta

Este é o portão canônico:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Pare `npm run dev` antes da suíte. Se mexeu em UI, depois reinicie o servidor,
garanta banco populado, rode `npm run test:a11y` e abra cada tela alterada no
navegador; typecheck, build e axe não cobrem os fluxos nem as armadilhas de
Server Components.
