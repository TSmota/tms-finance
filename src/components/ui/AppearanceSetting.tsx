"use client";

import { Center, SegmentedControl, useMantineColorScheme } from "@mantine/core";
import { Laptop, Moon, Sun } from "lucide-react";
import { useMounted } from "@mantine/hooks";

export function AppearanceSetting() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const mounted = useMounted();

  const current = mounted ? colorScheme : "auto";

  return (
    <SegmentedControl
      value={current}
      onChange={(value) => setColorScheme(value as "light" | "dark" | "auto")}
      data={[
        {
          value: "light",
          label: (
            <Center style={{ gap: 8 }}>
              <Sun size={16} aria-hidden />
              <span>Claro</span>
            </Center>
          ),
        },
        {
          value: "dark",
          label: (
            <Center style={{ gap: 8 }}>
              <Moon size={16} aria-hidden />
              <span>Escuro</span>
            </Center>
          ),
        },
        {
          value: "auto",
          label: (
            <Center style={{ gap: 8 }}>
              <Laptop size={16} aria-hidden />
              <span>Automático</span>
            </Center>
          ),
        },
      ]}
    />
  );
}
