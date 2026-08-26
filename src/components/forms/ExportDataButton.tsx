"use client";

import { useState } from "react";
import { Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Download } from "lucide-react";

import { exportMyData } from "@/actions/userAccount";
import { todayCalendarDate } from "@/lib/dates";

export function ExportDataButton() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);

    try {
      const result = await exportMyData();

      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });

        return;
      }

      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");

      link.href = url;
      link.download = `tms-finance-${todayCalendarDate()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Group>
      <Button
        variant="light"
        leftSection={<Download size={16} />}
        loading={loading}
        onClick={handleExport}
      >
        Exportar meus dados
      </Button>
    </Group>
  );
}
