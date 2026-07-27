---
id: cb1ff4ae-760b-4fab-a8b6-7fd98666c4a5
slug: missoes
type: doc
title: Missão ENTREGUE: re-implantar o lado identidade do session seam (onIdentityChanged) — recuperado do crash
tags: 
provenance: observado
evidence: ENTREGUE em main commit 0121144 (@lazuli/react 0.4.0): session-seam.ts signIn/onIdentityChanged + 10 testes. Origem: decisão dc6d7f9c (impl perdida no crash de 2026-06-11).
decay: stable
created: 2026-06-12T22:28:03.725008500+00:00
updated: 2026-06-15T14:25:06.001862800+00:00
validated: 2026-06-15T14:25:06.001862800+00:00
links: 
---

Origem: a decisão [[dc6d7f9c]] descreve `onIdentityChanged` no `createSessionSeam` como entregue numa branch (lazuli-react "0.3.0", commit "18a2a8c na branch rescue") que se perdeu no crash de vídeo do Windows de 2026-06-11 — `git grep` confirmou que o código não existia em nenhuma ref.

## ENTREGUE (2026-06-15, @lazuli/react 0.4.0, commit 0121144) — junto da wave de auth [[25bdd964]]

Critério de aceite cumprido:
1. ✅ Porta `onIdentityChanged` (wipe total `queryClient.clear()`) distinta de `onSessionChanged` (reset leve da rotação), disparada por `signIn` e `clearSession`; `bootstrapSession` dispara só a rotação. Nada força/permite sign-in sem o wipe (a superfície separa as portas por construção).
2. ⤳ Copy da LZFE016: NÃO sobrecarregada (decisão deliberada) — em vez disso o catálogo ganhou seção dedicada "Sign-in is an identity change, not a rotation". Melhor separação; LZFE016 segue só sobre a porta única do write.
3. ✅ docs/FRONTEND-CONVENTIONS.md registra o par.
4. ✅ Teste do caso "linha COMPLETE da conta A não sobrevive ao sign-in da conta B" (session-seam.test.ts).
5. ✅ Bump @lazuli/react 0.4.0.

Shipou junto o irmão que faltava: o guard simétrico `guardSession` (bug do guest-guard do pauta). Pitfall+cura durável consolidados em [[36c06c8f]]. Não está mais perdida.
