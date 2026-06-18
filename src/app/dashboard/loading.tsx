import { Card, Grid, GridCol, Group, Skeleton, Stack } from "@mantine/core";

export default function DashboardLoading() {
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={6}>
          <Skeleton height={28} width={200} />
          <Skeleton height={14} width={260} />
        </Stack>
        <Skeleton height={36} width={170} radius="md" />
      </Group>

      <Grid>
        {[0, 1, 2].map((i) => (
          <GridCol key={i} span={{ base: 12, sm: 4 }}>
            <Card withBorder radius="md" padding="lg">
              <Skeleton height={12} width="50%" />
              <Skeleton height={24} width="70%" mt="md" />
            </Card>
          </GridCol>
        ))}
      </Grid>

      <Card withBorder radius="md" padding="lg">
        <Skeleton height={18} width={160} mb="md" />
        <Stack gap="sm">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={28} />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
