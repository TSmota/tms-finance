import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { CornerDownRight } from "lucide-react";

import { requireUser } from "@/lib/session";
import { listCategoryTree } from "@/lib/categories";
import { DEFAULT_CATEGORY_COLOR } from "@/lib/currency";
import { AddCategoryButton } from "@/components/forms/AddCategoryButton";
import { EditCategoryButton } from "@/components/forms/EditCategoryButton";
import { DeleteCategoryButton } from "@/components/forms/DeleteCategoryButton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function CategoriesPage() {
  const user = await requireUser();
  const tree = await listCategoryTree(user.id);

  const rootOptions = tree.map((root) => ({ value: root.id, label: root.name }));

  return (
    <Stack gap="lg">
      <PageHeader
        title="Categorias"
        subtitle="Organize seus gastos em categorias e subcategorias"
        action={<AddCategoryButton rootCategories={rootOptions} />}
      />

      {tree.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState message="Nenhuma categoria ainda. Crie a primeira para começar a classificar seus lançamentos." />
        </Card>
      ) : (
        <Stack gap="sm">
          {tree.map((root) => (
            <Card key={root.id} withBorder radius="md" padding="lg">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm">
                  <Badge color={root.color ?? DEFAULT_CATEGORY_COLOR} variant="light" size="lg">
                    {root.name}
                  </Badge>
                  {root.subcategories.length > 0 && (
                    <Text size="xs" c="dimmed">
                      {root.subcategories.length}{" "}
                      {root.subcategories.length === 1 ? "subcategoria" : "subcategorias"}
                    </Text>
                  )}
                </Group>
                <Group gap={4} wrap="nowrap">
                  <EditCategoryButton
                    id={root.id}
                    name={root.name}
                    color={root.color}
                    parentId={null}
                    rootCategories={rootOptions}
                  />
                  <DeleteCategoryButton id={root.id} name={root.name} />
                </Group>
              </Group>

              {root.subcategories.length > 0 && (
                <Stack gap={4} mt="md" pl="md">
                  {root.subcategories.map((child) => (
                    <Group key={child.id} justify="space-between" wrap="nowrap">
                      <Group gap="xs">
                        <CornerDownRight size={14} color="var(--mantine-color-dimmed)" />
                        <Badge
                          color={child.color ?? DEFAULT_CATEGORY_COLOR}
                          variant="dot"
                          size="md"
                        >
                          {child.name}
                        </Badge>
                      </Group>
                      <Group gap={4} wrap="nowrap">
                        <EditCategoryButton
                          id={child.id}
                          name={child.name}
                          color={child.color}
                          parentId={root.id}
                          rootCategories={rootOptions}
                        />
                        <DeleteCategoryButton id={child.id} name={child.name} />
                      </Group>
                    </Group>
                  ))}
                </Stack>
              )}
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
