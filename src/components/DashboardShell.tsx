"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  AppShell,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Text,
  Menu,
  Avatar,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  LayoutDashboard,
  Receipt,
  Repeat,
  Wallet,
  HandCoins,
  LogOut,
} from "lucide-react";
import { User } from "next-auth";

const links = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/dashboard/monthly-costs", label: "Custos mensais", icon: Receipt },
  { href: "/dashboard/recurring", label: "Recorrentes", icon: Repeat },
  { href: "/dashboard/accounts", label: "Contas", icon: Wallet },
  { href: "/dashboard/debts", label: "Dívidas", icon: HandCoins },
];

interface DashboardShellProps {
  user: User;
  children: React.ReactNode;
}

export function DashboardShell(props: DashboardShellProps) {
  const { user, children } = props;

  const [opened, { toggle }] = useDisclosure();
  const pathname = usePathname();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 260,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg" c="teal">
              TMS Finance
            </Text>
          </Group>

          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar color="teal" radius="xl" size={32}>
                    {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                  </Avatar>
                  <Text size="sm" visibleFrom="sm">
                    {user.name ?? user.email}
                  </Text>
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<LogOut size={16} />}
                onClick={() => signOut({ redirectTo: "/login" })}
              >
                Sair
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <ScrollArea>
          {links.map((link) => {
            const Icon = link.icon;
            const active =
              link.href === "/dashboard"
                ? pathname === link.href
                : pathname.startsWith(link.href);
            return (
              <NavLink
                key={link.href}
                component={Link}
                href={link.href}
                label={link.label}
                leftSection={<Icon size={18} />}
                active={active}
                onClick={() => opened && toggle()}
                mb={4}
              />
            );
          })}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
