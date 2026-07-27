---
id: 4becdf0c-9489-4c1a-bffc-52dfdca17ab8
slug: missoes
type: doc
title: Missão ENTREGUE: regra LZFE032 — `<Controller>` que ignora `fieldState`
tags: 
provenance: observado
evidence: lazuli-net commits 69cae8b (regra+testes), 9f52c88 (catálogo), 7ab8e68 (bump 0.8.0)
decay: stable
created: 2026-06-12T22:06:19.270989800+00:00
updated: 2026-06-12T22:26:56.023170900+00:00
validated: 2026-06-12T22:26:56.023170900+00:00
links: 
---

Origem: o mesmo incidente do save silencioso no hostpoint (2026-06-12): o Input de Descrição do GeneralPanel destruturava só `{ field }` no render do `<Controller>` — um erro de validação naquele campo não tinha NENHUMA superfície. Irmã da [[6ce70dc6]]; juntas fecham o ciclo "erro de validação sempre aparece".

## ENTREGUE (2026-06-12, lazuli-net main)

- **LZFE032 `controller-field-state`** no eslint-plugin-lazuli 0.8.0 (commit 69cae8b): render prop INLINE de `<Controller>` que nunca lê `fieldState` (nem destrutura, nem acessa — um walk de identifiers cobre as duas grafias) → warn; fix = `error={fieldState.error?.message}` no componente de campo. Render por referência (componente nomeado) não é analisado — visível em review. Testes: caso bom destruturado, caso bom com acesso `props.fieldState`, caso ruim só `{ field }`, caso ruim com props sem toque, render referenciado, não-Controller, teste exempt.
- **Tier**: warn na entrada, promove a error junto com a LZFE031 (par registrado no catálogo e no eslint.config.mjs).
- **Catálogo**: linha LZFE032 + a seção "Validation is never silent" no FRONTEND-CONVENTIONS.md (commit 9f52c88).
- **Fallout esperado no piloto** (pendente, via bump): Controllers de selects/toggles ganham `error=` que hoje não passam — ver a missão de migração do hostpoint.

Referências: hostpoint-monorepo commit 4b5f4230 (o Input de Descrição corrigido), clients/hostpoint-app/src/features/host/property-edit/panels/GeneralPanel.view.tsx.
