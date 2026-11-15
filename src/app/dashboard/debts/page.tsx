import { Alert, Card, Group, Stack } from "@mantine/core";
import { TriangleAlert } from "lucide-react";

import { requireUser } from "@/lib/session";
import { listDebts } from "@/lib/debts";
import { listPersonOptions } from "@/lib/people";
import { listCreditCardOptions } from "@/lib/creditCards";
import { loadFormOptions } from "@/lib/formOptions";
import { AddDebtButton } from "@/components/forms/AddDebtButton";
import { LinkButton } from "@/components/ui/AppLink";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { DebtsExplorer } from "@/components/ui/DebtsExplorer";

interface DebtsPageProps {
  /** `?person=<uuid>` filtra por pessoa, vindo da tela de pessoas. */
  searchParams: Promise<{ person?: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DebtsPage({ searchParams }: DebtsPageProps) {
  const user = await requireUser();
  const { person } = await searchParams;

  // Id inválido na URL é ignorado, não é erro: `?person=lixo` mostra tudo.
  const personId = person && UUID_PATTERN.test(person) ? person : undefined;

  const [debts, people, options, cards] = await Promise.all([
    listDebts(user.id, { personId }),
    listPersonOptions(user.id),
    loadFormOptions(user.id),
    listCreditCardOptions(user.id),
  ]);

  const filteredPerson = people.find((entry) => entry.value === personId);

  // Os três são obrigatórios no formulário: sem qualquer um deles o botão só
  // abriria um modal impossível de enviar.
  const missing = [
    people.length === 0 ? "uma pessoa" : null,
    options.accounts.length === 0 && cards.length === 0 ? "uma conta ou um cartão" : null,
    options.categories.length === 0 ? "uma categoria" : null,
  ].filter((entry) => entry !== null);

  const addButton = (
    <AddDebtButton
      people={people}
      categories={options.categories}
      accounts={options.accounts}
      cards={cards}
      defaultPersonId={personId}
      baseCurrency={user.baseCurrency}
    />
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title="Dívidas"
        subtitle={
          filteredPerson
            ? `Empréstimos e pendências de ${filteredPerson.label}`
            : "Empréstimos feitos e recebidos, com o motivo de cada um"
        }
        action={missing.length === 0 && addButton}
      />

      {missing.length > 0 && (
        <Alert color="blue" variant="light" icon={<TriangleAlert size={16} />}>
          Para registrar uma dívida você precisa de {missing.join(", ")}.
        </Alert>
      )}

      {filteredPerson && (
        <Group>
          <LinkButton href="/dashboard/debts">Ver todas as pessoas</LinkButton>
        </Group>
      )}

      {debts.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState
            message="Nenhuma dívida registrada."
            action={missing.length === 0 ? addButton : undefined}
          />
        </Card>
      ) : (
        <DebtsExplorer
          debts={debts}
          people={people}
          categories={options.categories}
          accounts={options.accounts}
          cards={cards}
          initialPersonId={personId}
        />
      )}
    </Stack>
  );
}
