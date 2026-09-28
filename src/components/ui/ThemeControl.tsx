"use client";

import { Button, Menu, useMantineColorScheme } from "@mantine/core";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useMounted } from "@mantine/hooks";

const schemes = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "auto", label: "Sistema", icon: Monitor },
] as const;

export function ThemeControl() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const mounted = useMounted();
  const selected = schemes.find((scheme) => scheme.value === (mounted ? colorScheme : "auto"))!;
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
