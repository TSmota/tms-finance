"use client";

import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { SessionProvider } from "next-auth/react";

/**
 * Registra o locale pt-br no dayjs.
 *
 * Precisa acontecer num módulo client: o Mantine formata datas no navegador com
 * `dayjs(valor).locale("pt-br")`, e `.locale()` só funciona se o pacote do
 * locale tiver sido importado **no bundle do cliente**. Quando este import
 * estava no `layout.tsx` — um Server Component — ele entrava apenas no bundle
 * do servidor, e o seletor de mês exibia "August de 2026".
 */
import "dayjs/locale/pt-br";

import { theme } from "@/theme";

/**
 * Providers de cliente da aplicação, reunidos num único módulo para manter o
 * layout raiz como Server Component enxuto.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <MantineProvider theme={theme}>
        <DatesProvider settings={{ locale: "pt-br", firstDayOfWeek: 0 }}>
          <Notifications />
          <ModalsProvider>{children}</ModalsProvider>
        </DatesProvider>
      </MantineProvider>
    </SessionProvider>
  );
}
