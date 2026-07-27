---
id: eef94569-0489-4abf-b657-91f7ecf75de3
slug: geral
type: fact
title: Portback p/ hostpoint: o feed e o checkout que ele rastreia é C:\Users\lucas\lazuli-net (NÃO o dev\lazuli-net do Pleiades)
tags: portback, hostpoint, local-feed, nuget, ambiente
provenance: observado
evidence: dotnet nuget list source --configfile hostpoint/nuget.config → lazuli-local = C:\Users\lucas\lazuli-net\local-feed; NU1102 no restore; git -C C:\Users\lucas\lazuli-net log = aa4c8e2 (0.5.0) antes do ff-pull
decay: seasonal
created: 2026-06-16T03:43:58.013313500+00:00
updated: 2026-06-16T03:43:58.013313500+00:00
validated: 2026-06-16T03:43:58.013313500+00:00
links: 
---

Pegadinha de ambiente confirmada ao portar o 0.6.0. Existem **dois checkouts do lazuli-net** nesta máquina (mesmo origin `github.com/lucasrgt/lazuli-net`):
- `C:\Users\lucas\dev\lazuli-net` — workspace do Pleiades (onde eu desenvolvo/commito/pusho).
- `C:\Users\lucas\lazuli-net` — o checkout que o **hostpoint** efetivamente rastreia.

A `nuget.config` do hostpoint usa `value="../../lazuli-net/local-feed"` e o `Lazuli.toml` usa `[framework] repo = "../../lazuli-net"`. A partir de `C:\Users\lucas\dev\hostpoint-monorepo`, `../../` sobe DOIS níveis → resolve em `C:\Users\lucas\lazuli-net` (sem o `dev\`), e NÃO no sibling `dev\lazuli-net`.

Consequência: empacotar em `dev\lazuli-net\local-feed` NÃO chega no hostpoint (restore dá `NU1102 ... mais próxima 0.5.0`). Loop correto do portback:
1. `git -C C:\Users\lucas\lazuli-net merge --ff-only origin/main` (ele estava 2 atrás; pull traz os commits já pushados).
2. Empacotar/semear o feed DELE: `dotnet pack` lá, ou copiar os `*.0.6.0.nupkg` de `dev\lazuli-net\local-feed` → `C:\Users\lucas\lazuli-net\local-feed` (artefato idêntico no mesmo commit).
3. `dotnet nuget locals http-cache --clear` + `dotnet restore --force` se o NuGet ainda servir versão stale do feed.

Pull + pack no checkout rastreado mantém source/feed/pilote todos em 0.6.0 → o framework-sync do `lazuli doctor` fica consistente sem reescrever a config do hostpoint.
