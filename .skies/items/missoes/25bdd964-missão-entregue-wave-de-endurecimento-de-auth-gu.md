---
id: 25bdd964-3c59-4de4-8113-2e7c1124ea4a
slug: missoes
type: doc
title: Missão ENTREGUE: wave de endurecimento de auth — guardSession simétrico + split identidade/rotação no seam
tags: auth, session, guards, frontend, wave, entregue
provenance: observado
evidence: lazuli-net main: commit 0121144 (código + @lazuli/react 0.4.0) + 8017c12 (docs). npm run check verde: 148 testes (26 arquivos), eslint self-test + typecheck OK.
decay: stable
created: 2026-06-15T14:23:48.239688800+00:00
updated: 2026-06-15T14:23:48.239688800+00:00
validated: 2026-06-15T14:23:48.239688800+00:00
links: 
---

Origem: dois bugs de prod relatados pelo usuário em pilotos lazuli-net (2026-06-15). pauta: usuário com token válido acessa `/login` sem redirect e "criar conta" o joga pra dentro. hostpoint: cookie/token forçaram separar o app em dois (viajante/anfitrião). Ambos app-level — o kit não tinha o primitivo que os tornaria impossíveis. Roteado ao especialista lazuli-frontend; diagnóstico e direção de design fechados pelo orquestrador. Pitfall+cura durável em [[36c06c8f]].

## ENTREGUE (2026-06-15, lazuli-net main, @lazuli/react 0.4.0)

- **`guardSession` no spine** (`packages/lazuli-react/src/guard.ts`, novo): decisão de guard como dado PURO e router-agnóstico — `GuardOutcome` = `wait | render | redirect`, nunca navega. `guardSession(session, { allow: "authenticated"|"anonymous", redirectTo })`: auth-guard e guest-guard são a MESMA chamada com `allow` invertido. Mata o bug do pauta por construção — o guest-guard vira uma flag, não algo que cada app redescobre. Exportado no index.ts (`guardSession`, `GuardOutcome`, `GuardOptions`). 3 testes (simetria loading→wait, bounce anônimo-em-privada, bounce logado-em-guest).

- **Split identidade vs rotação no `session-seam.ts`:** porta nova `onIdentityChanged` (wipe TOTAL, `queryClient.clear()`) distinta de `onSessionChanged` (reset leve da rotação). A superfície força o reset certo por entrada — `signIn`→identidade (wipe), `bootstrapSession`→rotação (leve), `clearSession`→identidade (wipe). Mata o vazamento de cache A→B que originou o split do hostpoint. `onAuthenticated` virou `@deprecated` alias de `signIn` (era o nome que conflava login e bootstrap); `onIdentityChanged` omitido cai pra `onSessionChanged` (retrocompat). +6 testes (10 no total no arquivo), os 5 antigos intactos.

- **Catálogo** (`docs/FRONTEND-CONVENTIONS.md`, +82 linhas): seções "Sign-in is an identity change, not a rotation" e "Route guards are symmetric — guardSession".

## NÃO shipado (com justificativa)
Regra LZFE pro guard guest **ausente** — recusada: o sinal está partido entre o ViewModel (chama `signIn`) e o `_layout` da rota (onde mora o guard), fora do alcance do linter de arquivo único; uma regra por-arquivo daria falso-positivo em todo app corretamente guardado (a LZFE018 só funciona porque leitura e redirect são co-locados). Primitivo + convenção carregam. Documentado inline no catálogo.

## Pendente (não bloqueia): portback nos pilotos
hostpoint/pauta ao bumpar pra 0.4.0: `onAuthenticated`→`signIn`, wirar `onIdentityChanged: queryClient.clear()`, envolver `/login`+`/signup` em GuestRoute. No hostpoint é o que remove a necessidade dos dois apps. `MONOREPO-ARCHITECTURE.md:176` ainda descreve o lib/session do piloto em `onAuthenticated` — deixado como está (descritivo do estado do piloto; o alias o mantém válido).
