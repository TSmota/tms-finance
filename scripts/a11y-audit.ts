import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Auditoria de acessibilidade com axe-core num Chrome de verdade. Sai com 1 se
 * houver violação. Fica fora do Vitest porque a regra `color-contrast` compara
 * cor computada com fundo pintado, e o jsdom não tem layout nem cascata.
 *
 *   npm run dev            # em outro terminal
 *   npm run test:a11y
 */

const BASE = process.env.A11Y_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.A11Y_EMAIL ?? "demo@tms.finance";
const PASSWORD = process.env.A11Y_PASSWORD ?? "demo1234";

/** WCAG 2.2 nível AA. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** As de detalhe entram por `discoverDetailRoutes`, porque dependem de id. */
const ROUTES = [
  "/login",
  "/register",
  "/dashboard",
  "/dashboard/transactions",
  "/dashboard/cards",
  "/dashboard/recurring",
  "/dashboard/accounts",
  "/dashboard/categories",
  "/dashboard/people",
  "/dashboard/debts",
  "/dashboard/settings",
];

/**
 * Quantas rotas de detalhe `discoverDetailRoutes` tem de achar. Sem cartão nem
 * dívida no banco ela devolve zero, e a auditoria passaria medindo duas telas a
 * menos — um gate que degrada em silêncio não é gate.
 */
const DETAIL_ROUTES = 2;

/**
 * Todo formulário deste app vive dentro de um `Modal`, e o axe nunca tinha
 * visto nenhum: o conteúdo só existe no DOM depois do clique.
 *
 * O rótulo é o texto exato do botão, que é também o título do modal. Botão que
 * não aparece é falha, não "pulado": em `accounts` e `categories` ele é
 * incondicional, e nas demais os pré-requisitos vêm do seed, que esta auditoria
 * já exige.
 */
const MODAL_ROUTES: Array<[route: string, label: string]> = [
  ["/dashboard/accounts", "Adicionar conta"],
  ["/dashboard/categories", "Adicionar categoria"],
  ["/dashboard/transactions", "Adicionar transação"],
  ["/dashboard/cards", "Adicionar cartão"],
  ["/dashboard/people", "Nova pessoa"],
  ["/dashboard/debts", "Nova dívida"],
  ["/dashboard/recurring", "Nova recorrência"],
];

/**
 * Em WSL, sem um Chrome **Linux** instalado o resolvedor do Puppeteer acha o
 * `chrome.exe` do Windows via `wslpath`: o processo sobe, mas o pipe do CDP não
 * atravessa a fronteira e a conexão morre com "Target closed".
 */
function resolveChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const found = execFileSync("bash", [
      "-lc",
      "ls ~/.cache/puppeteer/chrome/*/chrome-linux64/chrome 2>/dev/null | head -1",
    ])
      .toString()
      .trim();

    if (found && existsSync(found)) {
      return found;
    }
  } catch {
    // cai no erro abaixo
  }

  throw new Error(
    "Chrome não encontrado. Instale o google-chrome-stable ou aponte CHROME_PATH.",
  );
}

/**
 * Orçamento da subida do Chrome. Eram 10s, e o runner do CI — que ainda segura
 * `next start`, Postgres e o seed — estourava esse teto de forma intermitente.
 * O laço sai assim que fica pronto, então folga aqui não custa tempo.
 */
const CHROME_TIMEOUT = 60_000;

/** Repete `passo` a cada 250ms até devolver não-nulo, ou `null` no estouro. */
async function until<T>(passo: () => Promise<T | null>): Promise<T | null> {
  const limite = Date.now() + CHROME_TIMEOUT;

  while (Date.now() < limite) {
    const valor = await passo();

    if (valor !== null) {
      return valor;
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  return null;
}

interface Cdp {
  evaluate: (expression: string) => Promise<unknown>;
  goto: (url: string) => Promise<void>;
  close: () => void;
}

/** Cliente CDP mínimo: o Puppeteer resolveria, mas por ~300 MB de dependência. */
async function connect(wsUrl: string): Promise<Cdp> {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("Falha ao abrir o WebSocket do CDP."));
  });

  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();

  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id);

    if (!entry) {
      return;
    }

    pending.delete(message.id);
    if (message.error) {
      entry.reject(new Error(JSON.stringify(message.error)));
    } else {
      entry.resolve(message.result);
    }
  };

  const send = (
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const id = (nextId += 1);
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");

  const evaluate = async (expression: string): Promise<unknown> => {
    const result = (await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as {
      exceptionDetails?: { exception?: { description?: string } };
      result: { value: unknown };
    };

    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? "Erro ao avaliar script na página.",
      );
    }

    return result.result.value;
  };

  const goto = async (url: string) => {
    await send("Page.navigate", { url });

    // O axe antes da hidratação mede o HTML do servidor, não a tela real.
    for (let i = 0; i < 80; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        if (await evaluate("document.readyState === 'complete'")) {
          break;
        }
      } catch {
        // contexto destruído no meio da navegação
      }
    }

    await new Promise((r) => setTimeout(r, 1200));
  };

  return { evaluate, goto, close: () => ws.close() };
}

const AXE_SOURCE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

interface Violation {
  id: string;
  impact: string;
  help: string;
  nodes: { target: string; html: string; resumo: string }[];
}

async function auditRoute(cdp: Cdp, route: string): Promise<Violation[]> {
  await cdp.goto(`${BASE}${route}`);

  return runAxe(cdp);
}

/** Audita a tela com o formulário aberto: foco preso, rótulos e contraste do modal. */
async function auditModal(cdp: Cdp, route: string, label: string): Promise<Violation[]> {
  await cdp.goto(`${BASE}${route}`);
  await cdp.evaluate(`(async () => {
    const label = ${JSON.stringify(label)};
    const button = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === label,
    );

    if (!button) {
      throw new Error('Botão "' + label + '" não encontrado em ' + location.pathname);
    }

    button.click();

    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      if (document.querySelector('[role="dialog"]')) {
        // O Transition do Mantine ainda está correndo; medir no meio dele
        // produz falso positivo de contraste sobre o overlay meio opaco.
        await new Promise((r) => setTimeout(r, 600));

        return true;
      }
    }

    throw new Error('O modal de "' + label + '" não abriu em ' + location.pathname);
  })()`);

  return runAxe(cdp);
}

async function runAxe(cdp: Cdp): Promise<Violation[]> {
  const injected = await cdp.evaluate("typeof window.axe !== 'undefined'");
  if (!injected) {
    await cdp.evaluate(AXE_SOURCE);
  }

  const raw = (await cdp.evaluate(`
    axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }
    }).then((r) => JSON.stringify(r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => ({
        target: n.target.join(' '),
        html: (n.html || '').slice(0, 160),
        resumo: (n.failureSummary || '').replace(/\\s+/g, ' ').slice(0, 200)
      }))
    }))))
  `)) as string;

  return JSON.parse(raw) as Violation[];
}

/** Descobre uma rota de detalhe de cartão e uma de dívida, se houver dados. */
async function discoverDetailRoutes(cdp: Cdp): Promise<string[]> {
  const found: string[] = [];

  for (const [lista, prefixo] of [
    ["/dashboard/cards", "/dashboard/cards/"],
    ["/dashboard/debts", "/dashboard/debts/"],
  ] as const) {
    await cdp.goto(`${BASE}${lista}`);
    const href = (await cdp.evaluate(
      `document.querySelector('a[href^="${prefixo}"]')?.getAttribute('href') ?? ''`,
    )) as string;

    if (href) {
      found.push(href);
    }
  }

  return found;
}

/**
 * Espera o `pathname` sair de `origem`, do lado de fora da página.
 *
 * O clique que envia o formulário pode navegar, e a navegação destrói o
 * contexto de qualquer `evaluate` pendente: esperar dentro da página troca a
 * causa real por `-32000 Inspected target navigated or closed`.
 */
async function waitForNavigation(cdp: Cdp, origem: string): Promise<string> {
  let atual = origem;

  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      atual = (await cdp.evaluate("location.pathname")) as string;
    } catch {
      continue; // contexto destruído no meio da navegação
    }

    if (atual !== origem) {
      return atual;
    }
  }

  return atual;
}

async function main() {
  const chrome = resolveChrome();
  const perfil = mkdtempSync(join(tmpdir(), "a11y-chrome-"));
  const log = join(perfil, "chrome.log");

  // Porta 0: quem escolhe é o Chrome, que publica a escolhida em
  // `DevToolsActivePort`. A versão anterior chutava a partir de
  // `process.uptime()` — quase determinístico, e sem diagnóstico se desse
  // choque. A saída vai para arquivo pelo mesmo motivo: com `/dev/null` a
  // falha chegava ao CI sem uma linha do Chrome.
  const proc = execFileSync("bash", [
    "-lc",
    `nohup "${chrome}" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage ` +
      `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1 ` +
      `--user-data-dir="${perfil}" about:blank > "${log}" 2>&1 & echo $!`,
  ])
    .toString()
    .trim();

  const saidaDoChrome = () => {
    const texto = existsSync(log) ? readFileSync(log, "utf8").trim() : "";
    return texto ? `\n\nSaída do Chrome:\n${texto.split("\n").slice(-15).join("\n")}` : "";
  };

  const port = await until(async () => {
    const arquivo = join(perfil, "DevToolsActivePort");

    if (!existsSync(arquivo)) {
      return null;
    }

    const linha = readFileSync(arquivo, "utf8").split("\n")[0]?.trim();

    return linha ? Number(linha) : null;
  });

  if (port === null) {
    throw new Error(
      `Chrome não publicou DevToolsActivePort em ${CHROME_TIMEOUT / 1000}s.${saidaDoChrome()}`,
    );
  }

  // Esperar a aba, e não `/json/version`: aquele responde antes de existir
  // alvo do tipo `page`, e conectar nessa janela pegava um alvo prestes a ser
  // trocado — o CDP respondia "Inspected target navigated or closed".
  const alvo = await until(async () => {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
        type: string;
        webSocketDebuggerUrl?: string;
      }[];

      return targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl ?? null;
    } catch {
      return null; // ainda subindo
    }
  });

  if (alvo === null) {
    throw new Error(
      `Chrome não publicou nenhuma aba em ${CHROME_TIMEOUT / 1000}s.${saidaDoChrome()}`,
    );
  }

  const cdp = await connect(alvo);
  let falhas = 0;

  try {
    // Sem sessão, todas as rotas redirecionam para /login e a auditoria mediria
    // a mesma tela em toda iteração — passando.
    await cdp.goto(`${BASE}/login`);
    await cdp.evaluate(`(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const senha = inputs.find((i) => i.type === 'password');
      // O TextInput do Mantine não emite \`type\`: identifica por exclusão.
      const email = inputs.find((i) => i !== senha);

      if (!email || !senha) {
        throw new Error('Formulário de login não encontrado em ' + location.pathname);
      }

      const setValue = (el, value) => {
        // React ignora \`el.value = x\`: o value tracker engole, e onChange não dispara.
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };

      setValue(email, ${JSON.stringify(EMAIL)});
      setValue(senha, ${JSON.stringify(PASSWORD)});
      document.querySelector('button[type="submit"]').click();
    })()`);

    const destino = await waitForNavigation(cdp, "/login");
    if (!destino.startsWith("/dashboard")) {
      throw new Error(
        `Login com ${EMAIL} parou em ${destino}, não no /dashboard. ` +
          "/api/auth/error é o Auth.js recusando o Host — sirva o build com " +
          "AUTH_TRUST_HOST=true. /login é credencial: rode 'npm run db:seed' " +
          "ou ajuste A11Y_EMAIL/A11Y_PASSWORD.",
      );
    }

    const rotas = [...ROUTES, ...(await discoverDetailRoutes(cdp))];
    const minimo = ROUTES.length + DETAIL_ROUTES;

    if (rotas.length < minimo) {
      throw new Error(
        `Apenas ${rotas.length} das ${minimo} rotas foram alcançadas: falta cartão ou ` +
          "dívida no banco para as telas de detalhe. Rode 'npm run db:seed'.",
      );
    }

    const report = (rotulo: string, violacoes: Violation[]) => {
      const total = violacoes.reduce((soma, v) => soma + v.nodes.length, 0);

      if (total === 0) {
        console.log(`  ok   ${rotulo}`);

        return;
      }

      falhas += total;
      console.log(`  FALHA ${rotulo} — ${total} violação(ões)`);
      for (const v of violacoes) {
        console.log(`        [${v.impact}] ${v.id}: ${v.help}`);
        for (const node of v.nodes) {
          console.log(`          ${node.target}`);
          console.log(`          ${node.resumo}`);
        }
      }
    };

    for (const rota of rotas) {
      report(rota, await auditRoute(cdp, rota));
    }

    for (const [rota, rotulo] of MODAL_ROUTES) {
      report(`${rota} [${rotulo}]`, await auditModal(cdp, rota, rotulo));
    }

    const medidas = rotas.length + MODAL_ROUTES.length;

    console.log(
      falhas === 0
        ? `\n${medidas} telas auditadas (${MODAL_ROUTES.length} com modal aberto), nenhuma violação.`
        : `\n${falhas} violação(ões) em ${medidas} telas auditadas.`,
    );
  } finally {
    cdp.close();
    try {
      process.kill(Number(proc));
    } catch {
      // já morreu
    }
  }

  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
