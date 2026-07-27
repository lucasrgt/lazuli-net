---
id: dc6d7f9c-3a04-4d5c-b4e7-c6cbd46132e4
slug: decisions
type: decision
title: Session seam: rotação ≠ troca de identidade — onIdentityChanged (DECISÃO OK; ENTREGUE de verdade no 0.4.0)
tags: 
provenance: observado
evidence: ENTREGUE em main commit 0121144 (@lazuli/react 0.4.0): session-seam.ts com signIn/onIdentityChanged. Antes (2026-06-12): só onSessionChanged em d0fe5ad; a impl da branch rescue se perdeu no crash de 2026-06-11.
decay: stable
created: 2026-06-12T04:23:03.801609400+00:00
updated: 2026-06-15T14:24:55.218622900+00:00
validated: 2026-06-15T14:24:55.218622900+00:00
links: 
---

Decisão (2026-06-12): o `createSessionSeam` distingue dois tipos de transição de token. ROTAÇÃO (bootstrap/refresh, mesma identidade) → `onSessionChanged` (reset leve, ex. `resetQueries(me)`) — um re-mint de 15 min nunca pode zerar telas quentes. SIGN-IN/SIGN-OUT (identidade pode mudar) → `onIdentityChanged` (wipe total, `queryClient.clear()`) — qualquer linha em cache da conta A servida aos guards da conta B é corrupta por definição.

Origem: bug do piloto hostpoint — viajante recém-registrado caiu direto no mapa sem onboarding porque um `my-traveler` COMPLETE da conta anterior sobreviveu no cache. O hostpoint corrigiu app-side (lib/session, hand-rolled) e depois contornou separando em dois apps.

## ENTREGUE DE VERDADE (2026-06-15, @lazuli/react 0.4.0, commit 0121144)

Re-implantada no `frontend-sdk/packages/lazuli-react/src/session-seam.ts`, com o naming final refinado em relação ao esboço original (`onSignedIn`→ método `signIn`):
- porta `onIdentityChanged` (wipe total) distinta de `onSessionChanged` (rotação leve), com fallback `onIdentityChanged ?? onSessionChanged` pra retrocompat;
- a superfície força o reset certo por ENTRADA: `signIn`→identidade, `bootstrapSession`→rotação, `clearSession`→identidade — nada permite autenticar sem o wipe;
- `onAuthenticated` virou `@deprecated` alias de `signIn` (era o nome que conflava os dois — a raiz do bug);
- teste do caso "conta A COMPLETE não sobrevive ao sign-in da conta B" presente (session-seam.test.ts, 10 testes).

Desvio do escopo original: a copy da LZFE016 NÃO foi sobrecarregada pra nomear as duas metades; em vez disso o catálogo ganhou uma seção dedicada "Sign-in is an identity change, not a rotation" (melhor separação de conceito). LZFE016 segue sendo só "uma porta pro write do token".

A DECISÃO continua válida e agora está implementada no spine. Entrega rastreada em [[25bdd964]]; pitfall+cura em [[36c06c8f]]. Não está mais perdida.
