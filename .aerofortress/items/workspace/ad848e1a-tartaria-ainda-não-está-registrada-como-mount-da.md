---
id: ad848e1a-df2f-4e3e-a8d9-0bcbcd2bdf69
slug: workspace
type: fact
title: Tartaria ainda não está registrada como mount da Nebulosa
tags: tartaria, knowledge, mount, routing
provenance: observado
evidence: mcp__knowledge__store retornou workspace `skies` para slug `Tartaria/release`; tentativa com workspace `Tartaria` retornou `workspace desconhecido`.
decay: volatile
created: 2026-08-14T01:55:53.033585400+00:00
updated: 2026-08-14T01:56:31.009871+00:00
validated: 2026-08-14T01:56:31.009871+00:00
links:
---

Em 13/08/2026, ao tentar persistir o estágio do repositório irmão `C:\Users\lucas\dev\Tartaria`, o mount `Tartaria/release` permaneceu na rede `skies` e o retarget `workspace: Tartaria` retornou `workspace desconhecido`. Portanto o repositório Tartaria ainda não possui rede/mount registrado no AeroFortress; conhecimento específico dele deve permanecer nos artefatos versionados do próprio repo até o registro existir.
