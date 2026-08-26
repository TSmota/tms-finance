"use client";

/**
 * Última rede: substitui o `layout.tsx` raiz inteiro, então não há
 * `MantineProvider` aqui — daí o HTML e o estilo crus.
 *
 * O `error.tsx` do dashboard não cobre o caso que importa: o `layout.tsx`
 * daquele segmento chama `requireUser()`, e erro no layout sobe para o
 * boundary do segmento **pai**.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#1a1b1e",
          background: "#fff",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Algo deu errado</h1>
          <p style={{ color: "#5c5f66", lineHeight: 1.5 }}>
            Não foi possível carregar o aplicativo. Pode ser um problema temporário no banco de
            dados ou no serviço de câmbio.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 8,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "#0f7b62",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
