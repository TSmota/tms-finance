import { DEFAULT_THEME } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { theme } from "./theme";

/**
 * Trava os tokens do tema, não as telas — para estas, `npm run test:a11y`.
 * Contraste de tela precisa de layout e cascata resolvida, que o jsdom não tem:
 * um teste de contraste aqui passaria sempre.
 */

const AA = 4.5;

/** Luminância relativa, WCAG 2.x §relative-luminance. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste entre duas cores, de 1 (igual) a 21 (preto sobre branco). */
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];

  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const WHITE = "#ffffff";

/** Escala efetiva: a do tema quando sobrescrita, senão a de fábrica. */
function scale(name: keyof typeof DEFAULT_THEME.colors): readonly string[] {
  return (theme.colors?.[name] ?? DEFAULT_THEME.colors[name]) as readonly string[];
}

describe("contraste dos tokens do tema", () => {
  it("a régua de contraste bate com os extremos conhecidos", () => {
    expect(contrast("#000000", WHITE)).toBeCloseTo(21, 1);
    expect(contrast(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  // O tom 9 carrega texto em três fundos, e precisa passar nos três.
  describe("tom 9 sobre os fundos onde ele aparece", () => {
    const CORES = [
      "teal",
      "red",
      "orange",
      "green",
      "blue",
      "yellow",
      "lime",
      "cyan",
      "grape",
      "violet",
      "indigo",
      "pink",
      "gray",
    ] as const;

    for (const nome of CORES) {
      it(`${nome}`, () => {
        const tons = scale(nome);
        const tinta = tons[9];

        expect.soft(contrast(tinta, WHITE), `${nome}-9 sobre branco`).toBeGreaterThanOrEqual(AA);
        expect.soft(contrast(tinta, tons[0]), `${nome}-9 sobre ${nome}-0`).toBeGreaterThanOrEqual(AA);
        expect.soft(contrast(tinta, tons[1]), `${nome}-9 sobre ${nome}-1`).toBeGreaterThanOrEqual(AA);
      });
    }
  });

  it("as cinco cores corrigidas ficaram mais escuras que as de fábrica", () => {
    // O tom de fábrica não falha necessariamente sobre branco — o teal-9 rende
    // 5.00 ali e só quebra sobre o próprio teal-1. Falha em *algum* dos três.
    for (const nome of ["teal", "orange", "green", "yellow", "lime"] as const) {
      const original = DEFAULT_THEME.colors[nome][9];
      const tons = DEFAULT_THEME.colors[nome];
      const piorDeFabrica = Math.min(
        contrast(original, WHITE),
        contrast(original, tons[0]),
        contrast(original, tons[1]),
      );

      expect(scale(nome)[9], `${nome}-9 deveria estar sobrescrito`).not.toBe(original);
      expect
        .soft(piorDeFabrica, `${nome}-9 de fábrica falharia em algum fundo`)
        .toBeLessThan(AA);
    }
  });

  describe("limiar do autoContrast", () => {
    // Branco sobre L rende 1.05/(L+0.05); preto rende (L+0.05)/0.05. Iguais em
    // (L+0.05)² = 1.05 × 0.05.
    const CRUZAMENTO = Math.sqrt(1.05 * 0.05) - 0.05;

    it("está no cruzamento, e não no padrão 0.3 do Mantine", () => {
      expect(theme.autoContrast).toBe(true);
      expect(theme.luminanceThreshold).toBeCloseTo(CRUZAMENTO, 3);
      expect(theme.luminanceThreshold).toBeLessThan(0.3);
    });

    it("garante AA para qualquer cor que o usuário escolher", () => {
      const limiar = theme.luminanceThreshold!;

      for (let L = 0; L <= 1; L += 0.005) {
        const contrasteObtido = L > limiar ? (L + 0.05) / 0.05 : 1.05 / (L + 0.05);

        expect
          .soft(contrasteObtido, `luminância ${L.toFixed(3)}`)
          .toBeGreaterThanOrEqual(AA);
      }
    });

    it("o pior caso fica no próprio cruzamento", () => {
      const pior = (CRUZAMENTO + 0.05) / 0.05;

      expect(pior).toBeGreaterThanOrEqual(AA);
      expect(pior).toBeLessThan(4.7);
    });
  });

  it("o tom primário do modo claro passa com rótulo branco", () => {
    const shade = theme.primaryShade as { light: number; dark: number };
    const fundo = scale("teal")[shade.light];

    expect(shade.light).toBe(9);
    expect(contrast(WHITE, fundo)).toBeGreaterThanOrEqual(AA);
  });

  it("o cinza para onde `--mantine-color-dimmed` aponta passa em AA", () => {
    // `globals.css` remapeia `dimmed` de gray-6 para gray-7; gray-6 rende 3.32.
    expect(contrast(DEFAULT_THEME.colors.gray[6], WHITE)).toBeLessThan(AA);
    expect(contrast(DEFAULT_THEME.colors.gray[7], WHITE)).toBeGreaterThanOrEqual(AA);
  });
});
