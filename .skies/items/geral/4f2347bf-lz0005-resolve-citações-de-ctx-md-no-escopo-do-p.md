---
id: 4f2347bf-c600-426f-b48a-01d88b48736e
slug: geral
type: fact
title: LZ0005 resolve citações de ctx.md no escopo do PRÓPRIO módulo — citar uma Journey (namespace .Journeys) dá falso "no longer exists"
tags: 
provenance: observado
evidence: hostpoint Account.ctx.md / Catalog.ctx.md citando TwoFactorJourney/PromotionJourney → LZ0005; classes existem em Hostpoint.Api.Journeys
decay: stable
created: 2026-06-13T16:58:10.794964+00:00
updated: 2026-06-13T16:58:10.794964+00:00
validated: 2026-06-13T16:58:10.794964+00:00
links: 
---

Observado no hostpoint (2026-06-13). Um `<Module>.ctx.md` que cita em backticks uma classe de Journey (`TwoFactorJourney`, `PromotionJourney`) dispara `LZ0005` "cites X, which no longer exists in the code" MESMO a classe existindo — porque as Journeys vivem em `Hostpoint.Api.Journeys`, FORA do namespace do módulo, e o resolver do LZ0005 procura símbolos no escopo do próprio módulo do ctx.md.

**Regra prática:** no Design notes de um módulo, NÃO cite por backtick tipos cross-cutting fora do namespace do módulo (journeys, platform). Descreva-os sem backtick ("covered by promotion journeys") ou cite só símbolos do próprio módulo (slices, VOs, entities). Nenhum outro módulo do app cita journey em ctx.md — confirma o padrão.

(Inferência a partir do sintoma: classe presente + LZ0005 dispara + fica fora do namespace do módulo. Não li o source do analyzer; se precisar de citação cross-module um dia, confirmar a regra de escopo.)
