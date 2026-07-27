---
id: eb7635fc-dcdf-4ae5-8a6d-3f5b0da8f423
slug: build
type: fact
title: SHIPPED: framework 2.1.4 + cli 0.2.1 + frontend-sdk 0.1.3 + AVP 0.2.0 — pilots conformados E GATED (skies gate em CI + lefthook, starter nasce gated)
tags: shipped, 2.1.4, born-gated, skies-gate, pilots, supply
provenance: observado
evidence: publish runs 28598725028 (v2.1.4, 3/3) + 28600112195 (dispatch sdk 0.1.3); skies gate GREEN em pauta e hostpoint (VERIFICATION.md commitados); commits 8886d48/72ea040/2f03c749
decay: volatile
created: 2026-06-25T18:08:30.703540900+00:00
updated: 2026-07-02T15:11:32.162609700+00:00
validated: 2026-07-02T15:11:32.162609700+00:00
links:
---

STATUS (02/07/2026): a onda "born gated" está shipada de ponta a ponta.

**Publicado:**
- NuGet: Skies.Framework.* **2.1.4** (inclui o fix `Validation.Collect` — merge sem perda de field errors aninhados, o código específico do registro sobrevive à composição) + **skies-framework-cli 0.2.1** (FrameworkPackageVersions=2.1.4). Assay.Net **0.2.0** (AVP, publicado 01/07).
- npm: **@skies/frontend-sdk 0.1.3** (tabela canônica auto-consistente; release-guard agora tem `canonicalDrift()` — ver scar [[21a671cf]]); react 0.6.0, eslint-plugin 0.11.0.

**Starter (`skies new`) nasce gated** (framework@b0b4b62): o template traz `.github/workflows/ci.yml` (roda `skies gate` em push/PR), `lefthook.yml` (pre-push doctor build) e `package.json` com `prepare: lefthook install`. Doutrina em CONVENTIONS.md → "The gate travels with the scaffold". Motivação: pilot aterrissou módulo inteiro com 100% dos testes vermelhos porque nada executava o gate.

**Pilots (02/07) — todos com skies gate GREEN e gate wired:**
- **pauta-web** (main `8886d48`): 1239/1239; CI + lefthook novos; VERIFICATION commitado. As 17 falhas ASI/APT corrigidas (seed sem Customer real — scar na rede do pauta).
- **fluxoterra** (branch avp/fluxoterra-deepening `72ea040`): 132/132; CI + lefthook novos.
- **hostpoint** (branch release/consolidate-avp `2f03c749`): 958/958+1skip; job backend do CI upgradeado pra `skies gate`; VERIFICATION commitado.

**Gap conhecido (follow-up):** o template `skies-app` NÃO é publicado (publish.yml não o empacota) — `skies new` só funciona onde o template foi instalado do repo. Vale empacotar como template package num próximo ciclo.
