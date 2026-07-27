---
id: 818f39ef-d735-4b96-84c4-02cef6a1c680
slug: frontend
type: fact
title: Existe app lazuli-net web-DOM puro em produção (React+Vite, sem RN-web)
tags: frontend, web-dom, vite, precedente
provenance: dito
evidence: relatado pelo usuário 2026-06-14 — projeto pauta-web-monorepo
decay: stable
created: 2026-06-15T01:59:31.717763400+00:00
updated: 2026-06-15T01:59:31.717763400+00:00
validated: 2026-06-15T01:59:31.717763400+00:00
links: 
---

O kit lazuli-net **não está preso a React Native**: o projeto **`pauta-web-monorepo`** roda o spine Lazuli (cliente gerado por orval, harness de teste, design tokens) sobre **React + Vite web-DOM puro**, sem `react-native-web`. Isso habilita usar bibliotecas de UI web-DOM (ex.: shadcn/ui) em apps web-only. Útil quando o produto é web B2B sem mobile no roadmap: o vetor de portabilidade do RN-web não paga seu custo. Confirmado como padrão viável (não especulativo).
