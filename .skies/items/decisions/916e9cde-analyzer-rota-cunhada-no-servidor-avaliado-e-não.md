---
id: 916e9cde-c71f-49ba-98c4-a99db426144c
slug: decisions
type: decision
title: Analyzer "rota cunhada no servidor" avaliado e NÃO shipado — a convenção + LZFE030 fecham o loop
tags: 
provenance: observado
evidence: docs/CONVENTIONS.md §"The contract never mints a client route" (commit 0d2e1c7); incidente hostpoint 23162dad
decay: stable
created: 2026-06-12T22:27:20.588174500+00:00
updated: 2026-06-12T22:27:20.588174500+00:00
validated: 2026-06-12T22:27:20.588174500+00:00
links: 
---

Decisão (2026-06-12, missão [[3c9b68ce]]): o analyzer LZ heurístico — flag em string literal começando com "/" em propriedade de payload de slice cujo nome case com *Target/*Route/*Href/*Path — foi avaliado e deliberadamente NÃO entra no doctor.

**Por quê:**
1. Os falsos positivos plausíveis são dado LEGÍTIMO de contrato: paths de API, object paths de storage, URLs de webhook. Um falso positivo ensina supressão (o anti-padrão que o framework evita em todo warn-tier — mesma lógica do trade recall/precisão do LZ0027 parent-scope).
2. O lado do CONSUMO já está fechado mecanicamente: com typed routes + LZFE030 (error), o cliente não consegue navegar para uma string arbitrária do servidor sem um cast — e o cast agora é error. O buraco que o analyzer cobriria já não compila.
3. A convenção documentada (CONVENTIONS.md "The contract never mints a client route" + FRONTEND-CONVENTIONS.md "Server-driven actions") carrega o rationale do incidente nos dois catálogos.

**Gatilho de revisita:** um piloto shipar outra rota cunhada server-side DEPOIS desta convenção ter aterrissado. Aí o custo do falso positivo se re-pesa contra a dor observada de novo.
