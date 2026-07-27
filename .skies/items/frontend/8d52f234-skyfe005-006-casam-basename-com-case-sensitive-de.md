---
id: 8d52f234-c5c4-454d-8b2a-3cd03ad48fc8
slug: frontend
type: scar
title: SKYFE005/006 casam basename com case-SENSITIVE — dev no Windows não vê, o primeiro CI Linux explode (tripla pauta/chatDock)
tags: skyfe, case-sensitivity, mvvm, ci-linux, turbo
provenance: observado
evidence: pauta CI runs 28600433909/28601088346 (RED, SKYFE005 depois SKYFE006) → 28601795005 SUCCESS após ff719ff; turbo_json_parse_error reproduzido local
decay: stable
created: 2026-07-02T15:34:49.386147300+00:00
updated: 2026-07-02T15:34:49.386147300+00:00
validated: 2026-07-02T15:34:49.386147300+00:00
links:
---

**O erro (02/07/2026, primeiro `skies gate` em CI no pauta):** duas triplas MVVM tinham viewModel minúsculo com view/teste PascalCase (`Pauta.view.tsx` + `pauta.viewModel.ts` + `Pauta.test.tsx`; idem `chatDock`). No Windows (FS case-insensitive) um `Pauta.test.tsx` satisfazia SKYFE005 (teste do viewModel, basename `pauta`) E SKYFE006 (integração da view, basename `Pauta`) — lint verde local por anos-luz. No ubuntu do CI, case-sensitive, as DUAS regras reprovaram em sequência (primeiro SKYFE005 pedindo `pauta.test.tsx`; renomeado, SKYFE006 pedindo `Pauta.test.tsx` de volta).

**O conserto de forma (pauta@ff719ff):** alinhar a tripla — viewModel sobe pra PascalCase acompanhando a view (`Pauta.viewModel.ts`, `ChatDock.viewModel.ts`), UM `Pauta.test.tsx` satisfaz as duas regras, imports atualizados. Nunca resolver criando dois arquivos de teste quase-idênticos.

**Lição (classe):** a tripla MVVM precisa de basename IDÊNTICO (inclusive case) em view/viewModel/teste. Dev em Windows + CI em Linux = case drift invisível até o primeiro run limpo. Ao criar tripla via scaffold isso nunca acontece (`skies g` gera consistente) — o drift nasce de renames manuais. Bônus do mesmo run: turbo v2 rejeita chave desconhecida em turbo.json (a chave "comment" quebra; usar comentário JSONC) e exige `packageManager` no package.json raiz.
