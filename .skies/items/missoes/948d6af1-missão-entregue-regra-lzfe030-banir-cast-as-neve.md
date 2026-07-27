---
id: 948d6af1-5946-4b73-a29c-9f17d611d207
slug: missoes
type: doc
title: Missão ENTREGUE: regra LZFE030 — banir cast (`as never`/`as any`) em navegação + typed routes
tags: 
provenance: observado
evidence: lazuli-net commits 69cae8b (regra+testes), 9f52c88 (catálogo), 7ab8e68 (bump 0.8.0)
decay: stable
created: 2026-06-12T22:05:37.168374300+00:00
updated: 2026-06-12T22:26:29.065012400+00:00
validated: 2026-06-12T22:26:29.065012400+00:00
links: 
---

Origem: bug de prod no piloto hostpoint (2026-06-12). O `HostHome.view.tsx` navega com `router.push("/host/..." as never)` em ~8 call sites — o cast existe para calar o typed-routes do expo-router, e com ele calado um literal de rota drifted compila limpo. No incidente real o literal errado veio do backend (missão irmã [[3c9b68ce]]), mas o buraco vale para qualquer literal.

## ENTREGUE (2026-06-12, lazuli-net main)

- **LZFE030 `no-cast-navigation`** no eslint-plugin-lazuli 0.8.0 (commit 69cae8b): proíbe `as never`/`as any`/`as unknown` no argumento de `router.push`/`replace`/`navigate`, em binding de `useNavigate()` (TanStack), e no `href`/`to` de `<Redirect>`/`<Navigate>`/`<Link>`. Acha o cast em qualquer profundidade do argumento (cobre `{ pathname: p as never }` e o double-cast `as unknown as Href`). Error-tier na família routing, wired no eslint.config.mjs. 8 casos de teste (bons e ruins) no self-test.
- **Guidance regra+config** documentada no catálogo (FRONTEND-CONVENTIONS.md, commit 9f52c88): typed routes ON (expo-router `experiments.typedRoutes` / TanStack route tree) é o par da regra — sem ele o cast removido degrada para `string`. Validação da config pelo doctor ficou avaliada e NÃO implementada nesta onda (sem dor observada ainda).
- **Fallout no piloto** pendente: chega via bump/rebase do mirror — ver a missão de migração do hostpoint.

Referências: hostpoint-monorepo commit 23162dad (o bug), clients/hostpoint-app/src/features/host/home/HostHome.view.tsx (call sites com cast).
