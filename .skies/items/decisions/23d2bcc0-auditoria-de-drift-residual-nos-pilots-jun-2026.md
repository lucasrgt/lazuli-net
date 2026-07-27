---
id: 23d2bcc0-bfcc-402e-acec-42a53e624e2f
slug: decisions
type: fact
title: Auditoria de drift residual nos pilots (jun/2026): api-error hand-rolled + safeBack-em-helper — corrigido; candidatos a regra/feature
tags: audit, drift, package-first, api-error, safeBack, regra-candidata, pilots
provenance: observado
evidence: 3 auditorias paralelas; fixes commitados: hostpoint 11de28da, fluxoterra 453460c, pauta 6128cf9; typecheck+lint verdes nos 3
decay: seasonal
created: 2026-06-25T19:08:20.414601400+00:00
updated: 2026-06-25T19:08:20.414601400+00:00
validated: 2026-06-25T19:08:20.414601400+00:00
links: 
---

Auditoria exaustiva dos 3 pilots (frontend spine + backend abstractions, via 3 agentes paralelos) procurando reimplementações hardcoded do que o framework entrega. Resultado: **backends 100% limpos** (zero Result/Error/Validation/ErrorBody locais; tudo consome Skies.Framework.* 2.1.0). Frontend: **4 drifts**, todos da MESMA família — a primitiva de **api-error** e o **safeBack** reescritos à mão:
- hostpoint `clients/hostpoint-app/src/lib/useGoBack.ts`: hand-rolling canGoBack/back/replace → agora delega a `safeBack` (@skies/react). Commit 11de28da.
- hostpoint `clients/app-core/src/lib/api-error.ts`: `apiErrorCopy` reimplementava o bridge → agora delega o path padrão (code→catálogo→fallback) ao `apiErrorCopy` do framework, mantendo os extras app (field-code, 401/403). Já usava `apiErrorCode`.
- fluxoterra `_shared/apiErrors.i18n.ts` + pauta `main.tsx`: ambos liam `error.response.data.code` à mão → agora `apiErrorCode`. Commits 453460c / 6128cf9.

**CANDIDATOS DE FRAMEWORK (gaps que o engine ainda não pega):**
1. Regra SKYFE nova: banir extração hand-rolled de `error.response.data.code`/`.fields` e back-nav hand-rolled DENTRO de helpers (SKYFE019 pega `router.back()` cru mas não um `useGoBack` que reimplementa a lógica) — steer pra apiErrorCode/apiErrorCopy/safeBack. Seria a "denylist de símbolos shipados" que ficou de fora do engine.
2. Feature candidata (package-first): hostpoint `src/Hostpoint.Api/Platform/Web.cs` tem um middleware `DbUpdateConcurrencyException → 409` auto-marcado "framework-shaped, candidate to lift" — o framework não shippa isso ainda; subir pro AspNetCore package.

Borderline deixados (legítimos): pauta `useGoBack` tem política deliberadamente diferente (sobe a hierarquia de rotas, não pop-history); guards `if(!id) return <Redirect>` triviais. Ver [[engine-anti-drift]].
