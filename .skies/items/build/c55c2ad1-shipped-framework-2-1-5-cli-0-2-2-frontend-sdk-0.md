---
id: c55c2ad1-071b-4ab9-bedb-29a797c69cca
slug: build
type: fact
title: SHIPPED: framework 2.1.5 + CLI 0.2.2 + frontend-sdk 0.1.4 — scaffold auth e mutations corrigidos, pilots atualizados
tags: release, pilots, auth, frontend-sdk
provenance: observado
evidence: framework commits f675562, ded8828, 363e465; tag v2.1.5; GitHub Actions runs 29212832248, 29213390381, 29213657137, 29213663486
decay: seasonal
created: 2026-07-12T23:42:18.368479400+00:00
updated: 2026-07-12T23:42:18.368479400+00:00
validated: 2026-07-12T23:42:18.368479400+00:00
links: 
---

STATUS (12/07/2026): onda publicada e consumida pelos pilots.

Publicado:
- NuGet Skies.Framework.* 2.1.5.
- dotnet tool Skies.Framework.Cli 0.2.2.
- npm @skies/react 0.1.4 e toolchain frontend-sdk correspondente.

Correções centrais:
- `skies g auth --skip-tenancy` passa a gerar contrato AVP completo, AdditionalFiles, suporte de testes, JSON enums, OrgId single-tenant coerente e replay de refresh que queima a família imediatamente.
- starter Ping recebe nome OpenAPI.
- Microsoft.OpenApi fica no floor auditado 2.10.0.
- scaffold Orval deixa de forçar todas as operações a `useQuery`; writes voltam a `useMutation`.

Provas:
- framework build verde; 269 testes .NET; frontend 177 testes; zero pacotes vulneráveis.
- smoke real `skies new` + `skies g auth --skip-tenancy`: 34/34, doctor verde.
- Hostpoint atualizado no commit eafeeeaa, CI 29213390381 verde.
- Pauta atualizado nos commits 2b6f91a + 6e26ae2, 1317/1317 e CI 29213657137 verde.
- Fluxoterra atualizado no commit 9e70c11 e gate local verde; CI 29213663486 não iniciou jobs por bloqueio de billing/limite da conta GitHub.
