---
name: ui-validation
description: 'Valida telas do TMS Finance no navegador. Use após criar ou alterar páginas, componentes, formulários, estilos, navegação, responsividade ou Server Components do Next.js.'
argument-hint: 'Rotas ou fluxo visual a verificar'
user-invocable: true
disable-model-invocation: false
---

# UI Validation

## Preparação

Leia `ARCHITECTURE.md` — Server Components e UI, e identifique todas as rotas afetadas. As quatro armadilhas de Server Component estão naquela seção, com o erro que cada uma produz; esta skill não as repete. Considere primeiro os componentes reutilizáveis de `src/components/ui/`.

## Procedimento

1. Garanta que typecheck e lint do trecho alterado passam.
2. Inicie `npm run dev` e use a URL e a porta realmente informadas pelo Next.js.
3. Abra cada tela nova ou alterada com uma ferramenta de navegador disponível.
4. Exercite o fluxo principal e os estados vazio, preenchido, inválido, carregando e erro quando aplicáveis.
5. Verifique console do navegador, erros de runtime, requests com falha e mensagens de hidratação.
6. Confira ao menos um viewport desktop e um mobile.
7. Verifique ausência de sobreposição, corte de texto, overflow horizontal, mudança inesperada de layout e controles inacessíveis.
8. Confirme navegação, foco, labels, teclado, modais, submissão e feedback de sucesso ou erro.
9. Capture evidência visual quando a ferramenta permitir e encerre o servidor ao terminar os testes automatizados.

Relate as rotas, viewports e interações verificadas, além de qualquer etapa que não pôde ser executada.
