---
id: e7d7f020-633c-4c3c-ad16-71cf00dca8e0
slug: skies-framework/build
type: scar
title: Não executar build e test simultaneamente no mesmo workspace
tags: build, test, parallelism, msbuild
provenance: observado
evidence: dotnet build Skies.Framework.slnx em 2026-07-20: MSB4018 GenerateMvcTestManifestTask, MvcTestingAppManifest.json em uso
decay: stable
created: 2026-07-20T20:10:12.048684100+00:00
updated: 2026-07-20T20:10:12.048684100+00:00
validated: 2026-07-20T20:10:12.048684100+00:00
links:
---

Ao iniciar `dotnet build Skies.Framework.slnx` e `dotnet test ... --no-build` em paralelo, ambos tocaram `Sample.Tests/obj/Debug/net10.0/MvcTestingAppManifest.json`; `GenerateMvcTestManifestTask` falhou com IOException por arquivo em uso. Verificação do mesmo checkout deve serializar build → test. Paralelismo só entre workspaces independentes.
