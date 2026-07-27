---
id: 5988953f-0370-4ff7-b93c-293bbe1185d9
slug: geral
type: fact
title: RefreshCookie/WebTokenCookie precisam aceitar Domain + SameSite (hoje SameSite=Strict hard-coded, sem Domain)
tags: 
provenance: observado
evidence: hostpoint src/Hostpoint.Api/Modules/Account/TrustedDeviceCookie.cs (re-implementação app-side)
decay: seasonal
created: 2026-06-13T16:58:03.881854700+00:00
updated: 2026-06-13T16:58:03.881854700+00:00
validated: 2026-06-13T16:58:03.881854700+00:00
links: 
---

Sinal do piloto hostpoint (2026-06-13, feature trusted-device 2FA): `Lazuli.Auth.RefreshCookie` é `SameSite=Strict` hard-coded e não expõe `Domain`. Um caso real (lembrar dispositivo por 60d, cookie que precisa sobreviver ao cross-persona entre dois apps de loja em subdomínios) NÃO consegue usar o primitivo — teve que ser re-implementado app-side em `Modules/Account/TrustedDeviceCookie.cs` (SameSite=Lax + Domain configurável).

**Generalização pedida:** RefreshCookie/WebTokenCookie devem aceitar `Domain` e `SameSite` (defaults atuais preservados — Strict/host-only continua o default seguro). Sem isso, qualquer app multi-subdomínio fura a fronteira package-first e cunha cookie à mão. Chegaria aos apps por bump; aí o `TrustedDeviceCookie` app-side colapsa no primitivo.
