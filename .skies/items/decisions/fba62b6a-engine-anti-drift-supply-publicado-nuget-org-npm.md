---
id: fba62b6a-0526-4b22-92fc-f6b3d6dc4630
slug: decisions
type: decision
title: Engine anti-drift: supply publicado (nuget.org+npmjs) + SSOT no doctor shipado (SEM lock novo) + enforcement no overlay
tags: anti-drift, package-first, supply, doctor, ssot, decisao, nuget, npm
provenance: dito
evidence: 
decay: stable
created: 2026-06-25T17:36:54.314649100+00:00
updated: 2026-06-25T17:54:29.648104+00:00
validated: 2026-06-25T17:54:29.648104+00:00
links: 
---

Decisão do Lucas (2026-06-25) pra resolver o desync recorrente dos pilots (hostpoint/pauta/fluxoterra) com o framework, de uma vez por todas.

**Supply:** registries PÚBLICOS via tag `v*` no `.github/workflows/publish.yml` (já existe): NuGet→nuget.org (Trusted Publishing/OIDC), npm→npmjs (secret NPM_TOKEN, scope @skies). As versões 2.0.0 / eslint 0.11.0 / react 0.6.0 / frontend-sdk 0.1.0 nunca foram tagueadas/publicadas — só existem locais (scar [[verde-falso-supply-efemera]]). Fix = tag → workflow publica. Invariante: clone limpo → restore → build → test VERDE dos registries, zero seed manual.

**SSOT (CORRIGIDO pelo Lucas — NÃO criar Skies.lock):** um lock próprio seria REDUNDANTE. A conformidade já é totalmente expressa por: (1) as refs dos pacotes DO FRAMEWORK nos csproj/package.json (= a declaração de versão); (2) o doctor SHIPADO que crava a versão esperada e gateia, auto-contido (FrameworkSync usa FrameworkPackageVersions baked — JÁ construído na branch engine/anti-drift); (3) os lockfiles do ecossistema (package-lock.json / nuget packages.lock.json) pra integridade de conteúdo. Um Skies.lock seria uma 4ª cópia das versões = MAIS superfície de drift. **Skies.toml fica SÓ topologia (sem versão).**

**Escopo da conformidade:** SÓ os pacotes que o framework PRODUZ (Skies.Framework.* nuget; @skies/* + eslint-plugin-skies npm). NUNCA as deps de terceiros do app (React, EF, TanStack, Npgsql...) — isso é do app. O FrameworkSync já casa só Include="Skies..." + os 3 nomes @skies.

**Componentes da engine (no framework, package-first):**
1. ✅ Gate auto-contido no doctor shipado (FrameworkSync crava FrameworkPackageVersions, gateia no CI sem checkout-irmão; o lado npm já é auto-contido no @skies/frontend-sdk). FEITO.
2. ✅ Teste de consistência da SSOT (FrameworkPackageVersions.Framework == <Version> dos props). FEITO.
3. Integridade de CONTEÚDO: imutabilidade do registry + pre-pack/CI gate que recusa empacotar versão já publicada com conteúdo ≠ (mata "0.10.0 ≠ 0.10.0"). + fingerprint do eslint-plugin se valer. PENDENTE.
4. Ban de vendor/mirror + reimplementação de primitives shipados. (mirror: FEITO; primitives-denylist: pendente)
5. Scaffolder/templates emitem versão da SSOT (FrameworkPackageVersions). GPT fez a base; verificar.
6. CI de cada pilot roda `skies doctor` (drift falha o build).

**DROPADO:** Skies.lock + versionamento no Skies.toml (redundantes com o acima).

**Enforcement comportamental:** overlay "framework-detected" manda a sessão verificar/curar drift (package-first) antes de trabalho substancial.
