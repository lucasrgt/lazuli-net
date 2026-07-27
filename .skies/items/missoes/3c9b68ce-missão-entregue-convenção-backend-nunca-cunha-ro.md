---
id: 3c9b68ce-bbbf-4115-821a-49c93716fdea
slug: missoes
type: doc
title: Missão ENTREGUE: convenção "backend nunca cunha rota do cliente" — kind fechado no contrato, mapa kind→rota no front
tags: 
provenance: observado
evidence: lazuli-net commits 0d2e1c7 (CONVENTIONS.md), 9f52c88 (FRONTEND-CONVENTIONS.md)
decay: stable
created: 2026-06-12T22:05:49.792456400+00:00
updated: 2026-06-12T22:27:07.387678400+00:00
validated: 2026-06-12T22:27:07.387678400+00:00
links: 
---

Origem: bug de prod no piloto hostpoint (2026-06-12). O slice `GetHostHome` shipava `HostHomePending.CtaTarget` como STRING de rota do app cunhada no servidor — duas delas não existiam no expo-router → 404 em prod. A string é dado de runtime, invisível ao OpenAPI, ao lint do front e ao typecheck.

## ENTREGUE (2026-06-12, lazuli-net main)

- **Convenção nos dois catálogos** (commits 0d2e1c7 + 9f52c88): CONVENTIONS.md ganhou "The contract never mints a client route" (slice convention) — o backend decide QUAL ação existe (enum fechado tipo `PendingKind` no Output), o cliente é dono do mapa `Record<PendingKind, Href>` sobre o enum gerado (exaustividade no typecheck, validade nos typed routes — composição com a LZFE030 [[948d6af1]]). Generalização registrada: servidor fala vocabulário de domínio (kinds/statuses/codes), cliente é dono do mapeamento de apresentação (rota/copy/ícone) — a disciplina LZ0018/LZ0019 aplicada à navegação. FRONTEND-CONVENTIONS.md ganhou "Server-driven actions — a closed kind, never a client route" com o shape canônico do Record.
- **Decisão sobre o analyzer LZ: NÃO shipado** — ver [[analyzer-rota-cunhada-nao-shipado]] (registrada também inline no CONVENTIONS.md): falso positivo plausível é dado legítimo de contrato (paths de API/storage/webhook), e o lado do consumo já fecha mecanicamente via LZFE030. Gatilho de revisita: outro piloto shipar rota cunhada DEPOIS da convenção.
- **Missão de migração apontada para o hostpoint** (CtaTarget → Kind enum, client regen, openPending vira lookup no Record) — item próprio na rede.
