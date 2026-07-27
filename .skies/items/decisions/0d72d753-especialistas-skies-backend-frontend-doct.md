---
id: 0d72d753-7aba-4950-8fa0-f1b4038b98de
slug: decisions
type: decision
title: Especialistas Skies (backend/frontend/doctor) migrados de fable → opus
tags: modelo, fable, opus, especialistas, agents, mythos
provenance: observado
evidence: skies-framework/skies-plugin/agents/skies-{backend,frontend,doctor}.md:3 (model: opus); morte do instance em constellation/agents/dev__skies-doctor.json (evento 2026-06-25T17:47:24, "Fable 5 unavailable")
decay: stable
created: 2026-06-25T17:56:34.523913900+00:00
updated: 2026-06-25T17:56:34.523913900+00:00
validated: 2026-06-25T17:56:34.523913900+00:00
links: 
---

Os três especialistas do plugin Skies — `skies-backend.md`, `skies-frontend.md`, `skies-doctor.md` — pinavam `model: fable` no frontmatter. Com o Fable 5/Mythos desativado pela Anthropic (ver decisão "Opus 4.8 default em TODO lugar que era fable", item 28b4e5db na rede do pleiades-harness), eles MORRIAM no spawn: o doctor pegou uma tarefa real de framework em 2026-06-25 17:47 e caiu na hora com "Claude Fable 5 is currently unavailable".

Flip aplicado (2026-06-25, a pedido do Lucas): `model: fable` → `model: opus` nos três defs, nas DUAS cópias — o repo-fonte (`skies-framework/skies-plugin/agents/`) e a cópia instalada que a harness carrega (`constellation/plugins/.../agents/`). `skies-scaffolder` já era `sonnet`; `luthier` já era `opus`. Nenhuma rotina pinava fable.

NÃO foram tocados (de propósito): a UI do picker (`api.ts` mantém `v:"fable"` label "Mythos" com `disabled:true`), a lógica de migração do `App.tsx` (precisa do id "fable" pra migrar localStorage→opus), as checagens de fronteira do backend (`claude.rs`/`agents.rs` `model.contains("fable")` — back-compat, não-operativo) e os comentários/registros que EXPLICAM a desativação (flipá-los inverteria a verdade). Só os pins operativos `model:` viraram opus.

Edits feitos no working tree do repo, na branch `engine/anti-drift` (mid-feature) — NÃO commitados pra não misturar concern com a feature em voo; o efeito já é imediato via a cópia instalada.
