---
id: 36c06c8f-9e10-44e7-9603-906db0a94b8d
slug: frontend
type: rule
title: Auth lazuli-net: o par guard simétrico + seam identidade-vs-rotação (cura shipada no 0.4.0)
tags: auth, session, guards, pitfall, frontend, entregue
provenance: observado
evidence: wave 2026-06-15 @lazuli/react 0.4.0: packages/lazuli-react/src/guard.ts (guardSession), session-seam.ts (signIn/onIdentityChanged), docs/FRONTEND-CONVENTIONS.md (2 seções novas). Origem: auditoria do pauta-web (login.tsx sem guard) + split viajante/anfitrião do hostpoint.
decay: stable
created: 2026-06-15T14:08:53.010400+00:00
updated: 2026-06-15T14:22:56.974433300+00:00
validated: 2026-06-15T14:22:56.974433300+00:00
links: 
---

Dois bugs de auth recorrentes em apps lazuli-net, ambos **app-level** (backend/runtime não os causam). O kit agora shipa a cura dos dois — o que falta é o portback nos pilotos.

**1. Guard guest-only ausente.** A LZFE017 policia a *forma* de um guard (branch num `SessionState` tri-state, nunca boolean), mas não pega um guard **ausente**. Apps escrevem o guard de rota privada e esquecem o inverso → com token válido, `/login` renderiza e `/signup` joga pra dentro (observado no pauta-web).
**CURA (0.4.0):** `guardSession(session, { allow: "authenticated"|"anonymous", redirectTo })` no spine (`guard.ts`) — primitivo PURO, router-agnóstico (retorna `GuardOutcome` `wait|render|redirect`, não navega). AuthRoute e GuestRoute são a MESMA chamada com `allow` invertido — o guest-guard deixa de ser algo que cada app re-deriva. O app liga ao `<Navigate>`/`<Redirect>` + splash UMA vez. *Sem regra LZFE pro guard ausente:* sinal espalhado entre o ViewModel (signIn) e o `_layout` (guard) — fora do alcance do linter de arquivo único; primitivo + convenção carregam, não regra.

**2. Sign-in tratado como rotação → cache vaza entre identidades.** O `createSessionSeam` antigo tinha só `onSessionChanged`, disparado em TODA transição. Troca de identidade (sign-out A → sign-in B no mesmo client) virava rotação: só o `me` resetava, o resto do cache do A vazava pro B. Foi a origem do split viajante/anfitrião do hostpoint (contorno, não fix).
**CURA (0.4.0):** porta `onIdentityChanged` (wipe TOTAL, `queryClient.clear()`) ≠ `onSessionChanged` (reset leve da rotação). A superfície força o reset certo por ENTRADA: `signIn`→identidade (wipe), `bootstrapSession`→rotação (leve), `clearSession`→identidade (wipe). `onAuthenticated` ficou `@deprecated` alias de `signIn` (era o nome que conflava os dois). `onIdentityChanged` omitido cai pra `onSessionChanged` (retrocompat — mas aí vaza; wire a porta).

**Backend herda-se (0.4.2):** `Lazuli.Auth` traz cookie httpOnly de refresh, modo `X-Client` web/mobile, rotação single-flight (fix do Augusto).

**PORTBACK que os pilotos devem (a fallout É a feature):** ao bumpar pra @lazuli/react 0.4.0 — migrar `onAuthenticated`→`signIn`, wirar `onIdentityChanged: queryClient.clear()`, e envolver `/login`+`/signup` num GuestRoute sobre `guardSession`. No hostpoint isso é o que remove a necessidade dos dois apps. Ver MONOREPO-ARCHITECTURE.md:176 (descreve o lib/session do piloto ainda em `onAuthenticated`).

**Regra de ouro:** autenticação = identidade única; capability/role = autorização (dado), nunca sessão separada. Modelar papéis como logins distintos reimporta o bug 2. Liga com [[818f39ef]] (apps web-DOM puro do kit).
