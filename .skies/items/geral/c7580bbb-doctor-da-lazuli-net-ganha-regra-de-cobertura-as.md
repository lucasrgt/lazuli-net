---
id: c7580bbb-b827-4548-8557-e413a57d9a27
slug: geral
type: decision
title: Doctor da lazuli-net ganha regra de cobertura Assay (require-verification)
tags: lazuli-net, doctor, assay, avp, lzfe, eslint, cobertura, planejado
provenance: dito
evidence: Spec em C:\Users\lucas\dev\avp\docs\doctor-coverage.md (commit no repo avp)
decay: stable
created: 2026-06-20T03:33:07.607516+00:00
updated: 2026-06-20T03:33:07.607516+00:00
validated: 2026-06-20T03:33:07.607516+00:00
links: 
---

Decisão (dita pelo dono): a aplicação de COMPLETUDE de verificação mora como REGRA no doctor que a lazuli-net já tem (camada ESLint/LZFE), não num doctor próprio do Assay (Assay é runtime-only; ADR 0001 — não construir doctor próprio).

Papel: o doctor estático cobra PRESENÇA/COBERTURA — "esta feature/view tem uma verificação Assay rodando o(s) arquétipo(s) que o tipo dela exige?". O Assay (runtime) cobra CORREÇÃO ("a verificação passa"). Junto com as regras LZFE de forma (loading/erro/empty) → história de completude completa do app lazuli: presente → coberto → correto.

Convenção que a regra casa (contrato estável do Assay): arquivos `*.assay.ts(x)` co-localizados, com `defineVerification(<archetype>, <subject>)` no topo. "Cobre o arquétipo A" = existe verificação co-localizada chamando defineVerification(A, …).

Regra `assay/require-verification` (ESLint): config mapeia selector de arquivo/view → arquétipos exigidos; falha se faltar verificação co-localizada cobrindo cada arquétipo. Spec completa (config, exemplos bom/ruim, boundary) em `C:\Users\lucas\dev\avp\docs\doctor-coverage.md`.

Impl recomendada: Assay publica um `eslint-plugin-assay` GENÉRICO com a regra; o doctor da lazuli HABILITA + configura (mapeia tipos de slice/view → arquétipos). Reutilizável por qualquer ecossistema (AVP é pra todos). Alternativa: regra LZFE bespoke na lazuli (idioma mais apertado, não reutilizável).

Boundary honesto: força "você checou?" (estático), NÃO "a verificação passa?" (runtime/Assay) nem "o catálogo está completo?" (convergente/escape accrual).

PENDENTE: implementar a regra (dono do trabalho: especialista lazuli-doctor, no repo da lazuli-net) — decidir impl home (eslint-plugin-assay genérico vs LZFE bespoke). Pré-req do Assay: só a convenção documentada (sem flag `required` por-critério — seria config morta, a regra é análise estática do arquivo).

Contexto: Assay = implementação JS/React de referência do protocolo AVP (verificação determinística de comportamento). Repo C:\Users\lucas\dev\avp.
