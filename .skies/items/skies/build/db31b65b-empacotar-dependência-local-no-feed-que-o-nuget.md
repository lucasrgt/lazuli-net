---
id: db31b65b-1694-4443-953e-96b6c5f52e62
slug: skies-framework/build
type: scar
title: Empacotar dependência local no feed que o NuGet realmente consulta
tags: nuget, local-feed, package-first, build
provenance: observado
evidence: dotnet build Skies.Framework.slnx em 2026-07-20 falhou NU1102 até Assay.Net.0.3.0.nupkg ser criado no source avp-local configurado
decay: stable
created: 2026-07-20T20:27:51.063484400+00:00
updated: 2026-07-20T20:27:51.063484400+00:00
validated: 2026-07-20T20:27:51.063484400+00:00
links:
---

Ao subir Assay.Net para 0.3.0, empacotar em `skies-framework/local-feed` não ajudou: `dotnet restore` consultava o source registrado `avp-local = C:\Users\lucas\dev\avp\assay.net\local-feed` e falhou NU1102. Antes de dogfood local, rodar `dotnet nuget list source` e empacotar no caminho exato configurado; um nupkg em outro diretório é supply inexistente.
