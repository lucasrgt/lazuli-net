---
id: 53f2b67b-4d49-4c1e-b18a-4624027f6392
slug: build
type: scar
title: Verde-falso por supply efêmera: versões bumpadas mas artefatos só no cache global / %TEMP%
tags: verde-falso, supply, nuget, npm, package-first, ci
provenance: observado
evidence: ls ~/.nuget/packages/skies.framework → 1.0.0,2.0.0; local-feed só *.1.0.0.nupkg; pilots nuget.config só nuget.org; npm canônicos só em %TEMP%/skies-sync-packs/*.tgz
decay: stable
created: 2026-06-25T17:37:06.637763900+00:00
updated: 2026-06-25T17:37:06.637763900+00:00
validated: 2026-06-25T17:37:06.637763900+00:00
links: 
---

Modo de falha que escondeu o desync dos pilots por meses e gerou um "verde" não-reproduzível.

**O que aconteceu:** todas as DECLARAÇÕES foram bumpadas (csproj → Skies.Framework.* 2.0.0; package.json → eslint-plugin 0.11.0 / @skies/react 0.6.0 / frontend-sdk 0.1.0) e o build local passou. MAS os ARTEFATOS só existiam efêmeros nesta máquina: os .nupkg 2.0.0 só no cache global `~/.nuget/packages/.../2.0.0` (o `local-feed` tinha só 1.0.0 e o nuget.config dos pilots listava só nuget.org, onde 2.0.0 não está); os .tgz npm canônicos só em `%TEMP%/skies-sync-packs/` (não publicados, fora dos lockfiles).

**Por quê é grave:** num clone limpo / CI / outra máquina → `dotnet restore` dá NU1102 e `npm ci` quebra. Verde local ≠ verde reproduzível. Pior: o gate (FrameworkSync) só rodava com o checkout-irmão presente, degradando pra "aviso" no resto → drift passava silencioso.

**Como evitar (a engine resolve):** publicar de verdade em registry autenticado; gate de conformidade auto-contido no doctor shipado (não depende de checkout-irmão, não degrada); SSOT em `Skies.lock` verificado; CI de cada pilot roda `skies doctor`. Teste de aceitação canônico: `git clone && restore && build && test` VERDE sem nenhum passo manual de seed.

**Como detectar agora:** `ls ~/.nuget/packages/<pkg>/` mostra a versão; comparar com o que o nuget.config/registry realmente serve. Se a versão referenciada existe SÓ no cache global e não no feed/registry configurado → é verde-falso. Ver decisão [[engine-anti-drift]].
