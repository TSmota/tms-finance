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
  CreditCard,
  Repeat,
  Wallet,
  Tags,
  Users,
  HandCoins,
  Settings,
  LogOut,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/dashboard/transactions", label: "Transações", icon: Receipt },
  { href: "/dashboard/cards", label: "Cartões", icon: CreditCard },
  { href: "/dashboard/recurring", label: "Recorrentes", icon: Repeat },
  { href: "/dashboard/accounts", label: "Contas", icon: Wallet },
  { href: "/dashboard/categories", label: "Categorias", icon: Tags },
  { href: "/dashboard/people", label: "Pessoas", icon: Users },
  { href: "/dashboard/debts", label: "Dívidas", icon: HandCoins },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
];

interface DashboardShellProps {
  user: { name: string | null; email: string };
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
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>

      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={opened ? "Fechar navegação" : "Abrir navegação"}
              aria-controls="navegacao-principal"
            />
            <Text fw={700} size="lg" c="teal">
              TMS Finance
            </Text>
          </Group>

          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <UnstyledButton aria-label={`Conta de ${user.name ?? user.email}`}>
                <Group gap="xs">
                  <Avatar color="teal" radius="xl" size={32} aria-hidden>
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
                leftSection={<LogOut size={16} aria-hidden />}
                onClick={() => signOut({ redirectTo: "/login" })}
              >
                Sair
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" id="navegacao-principal" aria-label="Navegação principal">
        <ScrollArea>
          {links.map((link) => {
            const Icon = link.icon;
            const active =
              pathname === link.href ||
              (link.href !== "/dashboard" &&
                pathname.startsWith(`${link.href}/`));
            return (
              <NavLink
                key={link.href}
                component={Link}
                href={link.href}
                label={link.label}
                leftSection={<Icon size={18} aria-hidden />}
                active={active}
                aria-current={active ? "page" : undefined}
                onClick={() => opened && toggle()}
                mb={4}
              />
            );
          })}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main id="conteudo">{children}</AppShell.Main>
    </AppShell>
  );
}
