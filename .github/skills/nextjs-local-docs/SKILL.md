---
name: nextjs-local-docs
description: 'Consulta a documentação local da versão instalada do Next.js antes de alterar APIs do framework. Use para App Router, Server Components, Server Actions, route handlers, proxy, cache, revalidation, cookies, headers, metadata, rendering ou configuração Next.js.'
argument-hint: 'API ou comportamento do Next.js a pesquisar'
user-invocable: true
disable-model-invocation: false
---

# Next.js Local Documentation

## Procedimento

1. Leia `package.json` para confirmar a versão instalada do Next.js.
2. Pesquise primeiro em `node_modules/next/dist/docs/` pelo conceito, API e avisos de depreciação relevantes.
3. Abra o guia mais específico em vez de inferir comportamento de versões anteriores do Next.js.
4. Compare a documentação com a implementação vizinha do repositório e com `AGENTS.md`.
5. Antes de editar, registre brevemente a API documentada, sua assinatura atual e qualquer mudança incompatível relevante.
6. Faça a menor alteração compatível com a versão instalada.
7. Valide com o teste mais específico disponível, `npm run typecheck` e, para comportamento de runtime, abra a rota no navegador.

## Regras

- A documentação em `node_modules/next/dist/docs/` prevalece sobre conhecimento geral de outras versões.
- Não use documentação de Pages Router para código em App Router.
- Atenda avisos de depreciação em vez de introduzir APIs legadas.
- Consulte documentação externa somente quando a documentação local não cobrir o caso, deixando explícita essa necessidade.