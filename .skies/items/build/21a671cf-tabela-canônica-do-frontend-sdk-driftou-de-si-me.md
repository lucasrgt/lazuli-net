---
id: 21a671cf-4e65-4c4b-a6dc-b58d1e210697
slug: build
type: scar
title: Tabela canônica do frontend-sdk driftou de si mesma — 0.1.2 publicado dizendo "canônico é 0.1.1" derrubou o sync gate dos pilots
tags: release, ssot, canonical, framework-sync, antibody
provenance: observado
evidence: framework@20bab0c (fix + canonicalDrift no release-guard); erro observado: skyfe-framework-sync no pauta com sdk 0.1.2 instalado; publish dispatch 28600112195 verde
decay: stable
created: 2026-07-02T15:10:52.887700200+00:00
updated: 2026-07-02T15:10:52.887700200+00:00
validated: 2026-07-02T15:10:52.887700200+00:00
links:
---

**O erro:** o release do frontend-sdk 0.1.2 (fix do shebang, 02/07/2026) bumpou o `package.json` mas esqueceu a `FRONTEND_PACKAGE_VERSIONS` em `tools/package-versions.mjs` — a tabela que o `skyfe-framework-sync` usa pra cobrar os pilots **viaja dentro do próprio pacote**. Resultado: todo pilot que obedeceu o bump pra ^0.1.2 ficou VERMELHO no sync gate ("canonical is 0.1.1 but this app declares ^0.1.2") — o fiscal era o desatualizado, e o `skies gate` inteiro reprovava por motivo falso.

**A correção (framework@20bab0c):** tabela atualizada e sdk republicado como **0.1.3** (a tabela precisa apontar a versão em que ela mesma embarca); pilots bumpados pra ^0.1.3.

**O antibody:** `release-guard.mjs` agora tem `canonicalDrift()` — falha o publish quando qualquer entrada da FRONTEND_PACKAGE_VERSIONS difere do package.json do pacote correspondente no repo. O guard roda no job `guard` do publish.yml, então esta classe de release não sai mais.

**Lição (classe):** constante SSOT que É PUBLICADA dentro de um pacote precisa de um check de auto-consistência no release — bump de versão sem bump da tabela interna é exatamente o drift que a tabela existe pra impedir.
