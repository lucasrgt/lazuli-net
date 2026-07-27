---
id: 6ce70dc6-923c-4bf0-8628-239f00141388
slug: missoes
type: doc
title: Missão ENTREGUE: primitivo `submitOrReveal` no @lazuli/react + regra LZFE031 — handleSubmit sem onInvalid
tags: 
provenance: observado
evidence: lazuli-net commits d7dac11 (primitivo+testes), 69cae8b (regra), 0684eee (sample), 7ab8e68 (bumps)
decay: stable
created: 2026-06-12T22:06:09.675160800+00:00
updated: 2026-06-12T22:26:40.954796900+00:00
validated: 2026-06-12T22:26:40.954796900+00:00
links: 
---

Origem: bug de prod no piloto hostpoint (2026-06-12). O editor de propriedade (9 tabs, um submit global) chamava `handleSubmit(onValid)` SEM o segundo argumento: falha de validação em campo de tab oculta deixava o botão Salvar completamente mudo. LZFE013/LZFE027 cobrem mutação falhada, mas a falha acontece ANTES da mutação.

## ENTREGUE (2026-06-12, lazuli-net main)

- **`submitOrReveal` no spine** @lazuli/react 0.3.0 (commit d7dac11, `src/submit.ts`): envolve o handleSubmit do RHF via tipo ESTRUTURAL `HandleSubmitLike` (zero dependência de form lib, cf. QueryLike/BackRouter). `onInvalid` é opção OBRIGATÓRIA (a superfície não pode ser omitida por construção); o submit resolve o primeiro campo inválido (`keyof Form | null`) — com `order` para ordem visual — para o shell navegar (tab/step/focus). A chave `root` do RHF nunca resolve como campo. 5 testes, incluindo um wired contra o react-hook-form REAL (renderHook + zodResolver).
- **LZFE031 `submit-handles-invalid`** no plugin 0.8.0 (commit 69cae8b): `handleSubmit(` com UM argumento em *.viewModel.ts → warn. Warn-tier na entrada (form de tela única com erros inline visíveis é legítimo); promove a error junto com a LZFE032 ([[4becdf0c]]).
- **Catálogo**: seção "Validation is never silent — submitOrReveal (LZFE031/032)" no FRONTEND-CONVENTIONS.md §Forms (commit 9f52c88).
- **Sample migrado** (commit 0684eee): Deposit.viewModel usa o primitivo com reveal = `form.setFocus(first)` — a instância canônica.
- **Pendente no piloto**: o submit do HostPropertyEdit migra do shape manual (4b5f4230) para o primitivo no bump — ver a missão de migração do hostpoint.

Referências: hostpoint-monorepo commit 4b5f4230 (o fix manual que virou o primitivo).
