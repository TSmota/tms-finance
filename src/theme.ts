'use client';

import {
  createTheme,
  DEFAULT_THEME,
  InputClearButton,
  Modal,
  Notification,
  type MantineColorsTuple,
} from '@mantine/core';

/** Escala do Mantine com o tom 9 — o que carrega texto — trocado por um que passa em AA. */
function withDarkerInk(name: keyof typeof DEFAULT_THEME.colors, ink: string): MantineColorsTuple {
  const scale = [...DEFAULT_THEME.colors[name]] as unknown as string[];
  scale[9] = ink;

  return scale as unknown as MantineColorsTuple;
}

// Contraste: os tons de fábrica não alcançam AA. `src/theme.test.ts` trava os números.
export const theme = createTheme({
  primaryColor: 'teal',
  primaryShade: { light: 9, dark: 6 },

  autoContrast: true,
  /** Cruzamento onde preto passa a render mais que branco; o padrão 0.3 do Mantine erra. */
  luminanceThreshold: 0.179,

  colors: {
    teal: withDarkerInk('teal', '#087b58'),
    orange: withDarkerInk('orange', '#bd3f0d'),
    green: withDarkerInk('green', '#277c38'),
    yellow: withDarkerInk('yellow', '#aa5800'),
    lime: withDarkerInk('lime', '#4c7b0b'),
  },

  components: {
    // No tema, não em `FormModal`: os modais de confirmação nascem do `modals` manager.
    Modal: Modal.extend({
      defaultProps: { closeButtonProps: { 'aria-label': 'Fechar' } },
    }),

    // O "x" de todo `clearable` nasce sem nome acessível, e ele aparece em
    // Select e DatePickerInput de quatro formulários.
    InputClearButton: InputClearButton.extend({
      defaultProps: { 'aria-label': 'Limpar campo' },
    }),

    // Mesmo defeito, e fora do alcance do `test:a11y`: a notificação some antes
    // de o axe rodar.
    Notification: Notification.extend({
      defaultProps: { closeButtonProps: { 'aria-label': 'Fechar aviso' } },
    }),
  },

  defaultRadius: 'md',
  fontFamily:
    'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  headings: {
    fontFamily:
      'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  },
});
