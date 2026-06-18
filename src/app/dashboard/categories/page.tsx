import {
    Badge,
    Card,
    Group,
    Stack,
    Table,
    TableTbody,
    TableTd,
    TableTh,
    TableThead,
    TableTr,
} from "@mantine/core";

import { AddCategoryButton } from "@/components/forms/AddCategoryButton";
import { DeleteCategoryButton } from "@/components/forms/DeleteCategoryButton";
import { EditCategoryButton } from "@/components/forms/EditCategoryButton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCategories } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function CategoriesPage() {
  const user = await requireUser();
  const categories = await getCategories(user.id);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Categorias"
        subtitle="Organize suas transações por categoria"
        action={<AddCategoryButton />}
      />

      <Card withBorder radius="md" padding="lg">
        {categories.length === 0 ? (
          <EmptyState message="Nenhuma categoria adicionada ainda." />
        ) : (
          <Table highlightOnHover>
            <TableThead>
              <TableTr>
                <TableTh>Nome</TableTh>
                <TableTh>Cor</TableTh>
                <TableTh ta="right">Ações</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {categories.map((category) => (
                <TableTr key={category.id}>
                  <TableTd>{category.name}</TableTd>
                  <TableTd>
                    <Badge color={category.color} variant="light">
                      {category.color.toUpperCase()}
                    </Badge>
                  </TableTd>
                  <TableTd>
                    <Group justify="flex-end" gap="xs">
                      <EditCategoryButton
                        id={category.id}
                        name={category.name}
                        color={category.color}
                      />
                      <DeleteCategoryButton id={category.id} name={category.name} />
                    </Group>
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
