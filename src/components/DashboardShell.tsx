"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { AppShell, Burger, Group, NavLink, ScrollArea, Text, Menu, Avatar, UnstyledButton } from "@mantine/core";
import { useDisclosure, useHotkeys, useMediaQuery } from "@mantine/hooks";
import { LayoutDashboard, Receipt, CreditCard, Repeat, Wallet, Tags, Users, HandCoins, Settings, LogOut, ChevronDown } from "lucide-react";

import { Brand } from "@/components/ui/Brand";
import { ThemeControl } from "@/components/ui/ThemeControl";

const groups = [
  { label: "Visão geral", links: [
    { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
    { href: "/dashboard/transactions", label: "Transações", icon: Receipt },
  ] },
  { label: "Seu dinheiro", links: [
    { href: "/dashboard/accounts", label: "Contas", icon: Wallet },
    { href: "/dashboard/cards", label: "Cartões", icon: CreditCard },
    { href: "/dashboard/recurring", label: "Recorrentes", icon: Repeat },
    { href: "/dashboard/debts", label: "Dívidas", icon: HandCoins },
  ] },
  { label: "Organização", links: [
    { href: "/dashboard/categories", label: "Categorias", icon: Tags },
    { href: "/dashboard/people", label: "Pessoas", icon: Users },
    { href: "/dashboard/settings", label: "Configurações", icon: Settings },
  ] },
];

interface DashboardShellProps {
  user: { name: string | null; email: string };
  children: React.ReactNode;
}

export function DashboardShell(props: DashboardShellProps) {
  const { user, children } = props;
  const [opened, { toggle, close }] = useDisclosure();
  const burger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const mobile = useMediaQuery("(max-width: 47.99em)");
  useHotkeys([["Escape", () => {
    if (opened) {
      close();
      burger.current?.focus();
    }
  }]]);

  return (
    <AppShell header={{ height: 72 }} navbar={{ width: 248, breakpoint: "sm", collapsed: { mobile: !opened } }} padding={{ base: "md", md: "xl" }}>
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <AppShell.Header className="app-header">
        <Group h="100%" px={{ base: "md", md: "xl" }} justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger ref={burger} opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label={opened ? "Fechar navegação" : "Abrir navegação"} aria-expanded={opened} aria-controls="navegacao-principal" />
            <Link href="/dashboard" aria-label="TMS Finance — Painel"><Brand /></Link>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <ThemeControl />
            <Menu shadow="md" width={220} position="bottom-end">
              <Menu.Target>
                <UnstyledButton className="user-menu" aria-label={`Conta de ${user.name ?? user.email}`}>
                  <Group gap="xs" wrap="nowrap">
                    <Avatar color="teal" radius="xl" size={34} aria-hidden>{(user.name ?? user.email).charAt(0).toUpperCase()}</Avatar>
                    <Text size="sm" fw={500} visibleFrom="md" maw={170} truncate>{user.name ?? user.email}</Text>
                    <ChevronDown size={14} aria-hidden />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user.email}</Menu.Label>
                <Menu.Item component={Link} href="/dashboard/settings" leftSection={<Settings size={16} aria-hidden />}>Configurações</Menu.Item>
                <Menu.Divider />
                <Menu.Item leftSection={<LogOut size={16} aria-hidden />} onClick={() => signOut({ redirectTo: "/login" })}>Sair</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md" id="navegacao-principal" aria-label="Navegação principal" className="app-navbar">
        <ScrollArea style={{ flex: 1 }}>
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <Text className="nav-group-label" size="xs" fw={600} c="dimmed">{group.label}</Text>
              {group.links.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`));
                return <NavLink className="app-nav-link" key={link.href} component={Link} href={link.href} label={link.label} leftSection={<Icon size={19} strokeWidth={1.8} aria-hidden />} active={active} aria-current={active ? "page" : undefined} onClick={() => {
                  close();
                  if (opened) {
                    // Aguarda a remoção de `inert` antes de mover o foco.
                    requestAnimationFrame(() => document.getElementById("conteudo")?.focus());
                  }
                }} />;
              })}
            </div>
          ))}
        </ScrollArea>
        <div className="sidebar-note"><Wallet size={18} aria-hidden /><Text size="xs" c="dimmed">Mais clareza para o seu dinheiro.</Text></div>
      </AppShell.Navbar>
      <AppShell.Main id="conteudo" tabIndex={-1} inert={opened && mobile}><div className="page-content">{children}</div></AppShell.Main>
    </AppShell>
  );
}
