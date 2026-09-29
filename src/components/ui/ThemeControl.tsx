"use client";

import { Button, Menu, useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { Check, Moon, Sun } from "lucide-react";
import { useMounted } from "@mantine/hooks";

const schemes = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
] as const;

export function ThemeControl() {
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light");
  const mounted = useMounted();
  const selected = schemes.find((scheme) => scheme.value === (mounted ? computedColorScheme : "light"))!;
  const Icon = selected.icon;

  return (
    <Menu position="bottom-end" width={190}>
      <Menu.Target>
        <Button variant="default" className="theme-control" leftSection={<Icon size={17} aria-hidden />} aria-label={`Aparência: ${selected.label}`}>
          <span className="theme-control-label">{selected.label}</span>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Aparência</Menu.Label>
        {schemes.map(({ value, label, icon: SchemeIcon }) => (
          <Menu.Item
            key={value}
            renderRoot={(props) => (
              <button {...props} role="menuitemradio" aria-checked={selected.value === value} />
            )}
            leftSection={<SchemeIcon size={16} aria-hidden />}
            rightSection={selected.value === value ? <Check size={16} aria-hidden /> : undefined}
            onClick={() => setColorScheme(value)}
          >
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
