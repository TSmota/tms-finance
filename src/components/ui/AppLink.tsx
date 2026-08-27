"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Group, Text } from "@mantine/core";
import { ArrowLeft } from "lucide-react";

/**
 * Ponte entre Server Components e o `component={Link}` do Mantine.
 *
 * Passar `component={Link}` de um Server Component levanta em runtime
 * "Functions cannot be passed directly to Client Components": `Link` é uma
 * função, e componentes Mantine são client. Não aparece no build, no typecheck
 * nem nos testes — só ao abrir a página.
 */

interface LinkButtonProps {
  href: string;
  children: ReactNode;
  size?: string;
  variant?: string;
  rightSection?: ReactNode;
  leftSection?: ReactNode;
}

export function LinkButton(props: LinkButtonProps) {
  const { href, children, size = "xs", variant = "light", rightSection, leftSection } = props;

  return (
    <Button
      component={Link}
      href={href}
      size={size}
      variant={variant}
      rightSection={rightSection}
      leftSection={leftSection}
    >
      {children}
    </Button>
  );
}

/** Link de volta discreto, para o topo de páginas de detalhe. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Text component={Link} href={href} size="sm" c="dimmed" td="none">
      <Group gap={4} wrap="nowrap" component="span">
        <ArrowLeft size={14} />
        {children}
      </Group>
    </Text>
  );
}
