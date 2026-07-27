---
id: 477d2a4f-f5e9-4358-8e3e-0b9fecb1ee5a
slug: geral
type: fact
title: Port Lazuli→Skies (rebrand): CONCLUÍDO — 5 repos, commits, e o único resto (mirror package-first)
tags: rebrand, lazuli, skies, port, concluido, package-first
provenance: observado
evidence: commits: skies-framework e6073c0; pleiades-harness 1f8e636; hostpoint 3b65964b/5ab0d460/8c6951dc; pauta f3537bb/003a014/260d942; fluxoterra 2ad9c6c/ba4c2ec/226671a. framework build+249 tests green; fluxoterra api compila (copy falhou só por exe em uso)
decay: seasonal
created: 2026-06-24T00:13:12.587444100+00:00
updated: 2026-06-24T01:01:26.734196500+00:00
validated: 2026-06-24T01:01:26.734196500+00:00
links:
---

Rebrand Lazuli→Skies portado em TODOS os repos (pedido do Lucas, "porte totalmente"). O código C# real já era Skies; o resto eram a camada de IA + metadados + docs + comentários.

**REGRAS:** `lazuli-net`→`skies-framework` (repo/pkg/slug/checkout — remote GH é skies-framework). `lazuli:` (erro CLI)→`skies:`. CLI verb `lazuli`→`skies`. `Lazuli`→`Skies`. `LZFE`→`SKYFE`, `LZ00nn`→`SKY00nn`. `AddLazuli`→`AddSkies`, `LazuliWebTest`→`SkiesWebTest`, `Lazuli.Testing.Postgres`→`Skies.Framework.Testing.Postgres`. Agentes `lazuli-{frontend,backend,scaffolder,doctor}`→`skies-*`, skill→`skies-feature`. Mutator orval `lazuli-client.ts`/`lazuliClient`→`skies-client.ts`/`skiesClient`. Scope npm `@lazuli/*`→`@skies/*`. PRESERVADO: cautionary tales (Lazuli-1/2/-the-language, old-lazuli) + memória da rede (.skies/items, handoffs, missoes, arquitetura, .specs/archive) + migrate.rs (migração FROM o nome velho).

**COMMITS (locais, não pushados exceto harness):**
- skies-framework `e6073c0` (build + 249 testes VERDE).
- pleiades-harness `1f8e636` (PUSHED, v1.0.36; cargo+tsc verde) — incl. FIX de bug: seeding clonava lazuli-net.git/pleiades-plugin, agora skies-framework.git/skies-plugin.
- hostpoint `3b65964b`(routing)+`5ab0d460`(mutator, lefthook verde)+`8c6951dc`(docs/comentários).
- pauta `f3537bb`+`003a014`+`260d942`.
- fluxoterra `2ad9c6c`+`ba4c2ec`+`226671a` (compila limpo; WIP de products/suppliers PRESERVADO uncommitted).

**ÚNICO RESTO (de propósito — package-first):** nos pilots, o dir `clients/eslint-plugin-lazuli` (mirror) + scripts `lzfe-*.mjs` + as MENSAGENS de regra "LZFE032" vêm do mirror do eslint-plugin, que é REBASEADO do framework (agora SKYFE). Resolve no próximo bump do pacote (copiar o index.cjs do framework + renomear lzfe-*→skyfe-*), NÃO por edição manual no piloto (desincronizaria). Substitui o estado "em andamento" anterior.
