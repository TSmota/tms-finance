import type { NextConfig } from "next";

/**
 * Política de conteúdo.
 *
 * `'unsafe-inline'` em `style-src` é exigência do Mantine, que emite estilo
 * inline em todo componente; em `script-src`, do bootstrap que o Next injeta no
 * HTML. Trocar os dois por nonce obriga a gerar um por requisição no proxy —
 * vale quando houver conteúdo de terceiro na página, e hoje não há.
 *
 * O que a lista abaixo já compra é o resto: `frame-ancestors 'none'` fecha o
 * clickjacking, `object-src 'none'` fecha plugin legado, e `form-action 'self'`
 * impede que um XSS futuro poste o formulário de login em outro domínio.
 */
function contentSecurityPolicy(): string {
  // O React Refresh do `next dev` compila com `eval`; em produção, não.
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    // `https:` porque o avatar do Google vem de host que muda sem aviso.
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          // Ignorado por navegador em http://localhost, então não atrapalha o dev.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
