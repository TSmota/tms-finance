'use client';

import {
  createTheme,
  defaultVariantColorsResolver,
  getPrimaryShade,
  isLightColor,
  ActionIcon,
  Button,
  Card,
  Table,
  type CSSVariablesResolver,
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
  primaryShade: { light: 9, dark: 4 },

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

  // A cor do texto acompanha o fundo por CSS, inclusive antes da hidratação.
  // Hex de categorias continua com o autoContrast original do Mantine.
  variantColorResolver: (input) => {
    const result = defaultVariantColorsResolver(input);
    const color = input.color ?? input.theme.primaryColor;
    if (input.variant === 'filled' && color in input.theme.colors) {
      return {
        ...result,
        color: `var(--app-${color}-contrast)`,
        hoverColor: `var(--app-${color}-hover-contrast)`,
      };
    }
    return result;
  },

  components: {
    Button: Button.extend({ defaultProps: { size: 'sm', variant: 'filled' } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { size: 36 } }),
    Card: Card.extend({ defaultProps: { radius: 'md' } }),
    Table: Table.extend({ defaultProps: { verticalSpacing: 'sm', horizontalSpacing: 'md' } }),
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

/** Variáveis dos dois esquemas são emitidas no SSR; alternar não remonta formulários. */
export const themeVariables: CSSVariablesResolver = (resolvedTheme) => {
  const schemes = { light: {}, dark: {} } as Record<'light' | 'dark', Record<string, string>>;
  for (const scheme of ['light', 'dark'] as const) {
    const shade = getPrimaryShade(resolvedTheme, scheme);
    for (const [name, colors] of Object.entries(resolvedTheme.colors)) {
      const ink = (index: number) => isLightColor(colors[index], resolvedTheme.luminanceThreshold)
        ? resolvedTheme.black : resolvedTheme.white;
      schemes[scheme][`--app-${name}-contrast`] = ink(shade);
      schemes[scheme][`--app-${name}-hover-contrast`] = ink(Math.min(shade + 1, 9));
    }
  }
  return { variables: {}, ...schemes };
};
