"use client";

import { useEffect, useState } from "react";
import { Alert, List, Loader, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { TriangleAlert } from "lucide-react";

import { getDeletionImpact } from "@/actions/deletionImpact";
import type { DeletionImpact, DeletionTarget } from "@/lib/deletionImpact";
import { parseCalendarDate } from "@/lib/dates";

interface DeletionImpactProps {
  target: DeletionTarget;
  id: string;
  /** Pergunta exibida acima da lista, já com o nome do recurso. */
  question: string;
  /** Id do modal de confirmação, para desabilitar "Remover" quando bloqueado. */
  modalId: string;
}

/**
 * Mostra, dentro do modal de confirmação, o que a remoção leva embora.
 *
 * A contagem só chega depois que o modal abriu: medi-la ao renderizar a lista
 * custaria uma consulta por linha da tela, e o número só interessa a quem
 * clicou em remover. Por isso o botão nasce habilitado e é desabilitado aqui —
 * `openConfirmModal` decide `confirmProps` antes de o impacto existir.
 */
export function DeletionImpactPreview(props: DeletionImpactProps) {
  const { target, id, question, modalId } = props;
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    getDeletionImpact(target, id).then((result) => {
      if (!active) {
        return;
      }

      if (result.ok) {
        setImpact(result.impact);

        if (result.impact.blockedBy) {
          modals.updateModal({ modalId, confirmProps: { color: "red", disabled: true } });
        }
      } else {
        setFailed(true);
      }
    });

    return () => {
      active = false;
    };
  }, [target, id, modalId]);

  return (
    <Stack gap="sm">
      <Text size="sm">{question}</Text>

      {impact === null && !failed && (
        <Loader size="xs" aria-label="Medindo o impacto da remoção" />
      )}

      {impact?.blockedBy && (
        <Alert color="red" icon={<TriangleAlert size={16} />}>
          {impact.blockedBy}
        </Alert>
      )}

      {impact !== null && !impact.blockedBy && impact.entries.length > 0 && (
        <Alert color="yellow" icon={<TriangleAlert size={16} />} title="O que vai junto">
          <List size="sm">
            {impact.entries.map((entry) => (
              <List.Item key={entry.key}>
                {entry.count} {entry.label}
              </List.Item>
            ))}
          </List>
          {impact.oldestRecord && (
            <Text size="sm" mt="xs">
              O registro mais antigo alcançado é de{" "}
              {parseCalendarDate(impact.oldestRecord).toLocaleDateString("pt-BR", {
                timeZone: "UTC",
              })}
              .
            </Text>
          )}
        </Alert>
      )}
    </Stack>
  );
}
