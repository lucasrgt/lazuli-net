---
id: 6a8b3db9-bf87-4c15-ad82-485f81017354
slug: arch
type: scar
title: SCAR: orquestrador ainda chamava lazuli-backend — fonte era o framework NÃO-pushado + registry de plugin stale, não os repos
tags: scar, rebrand, lazuli, plugin-sync, registry, git-push, runtime-cache
provenance: observado
evidence: plugins.json source=lazuli-net.git path=pleiades-plugin; git push de33c84..17a42c3; cache reset → skies-plugin/agents/skies-backend.md, context.md 0 lazuli
decay: stable
created: 2026-06-25T15:21:19.520775500+00:00
updated: 2026-06-25T15:21:19.520775500+00:00
validated: 2026-06-25T15:21:19.520775500+00:00
links: 
---

**O erro:** depois de renomear lazuli→skies nos 5 repos, o orquestrador (em runtime, noutra sessão) ainda dizia "vou chamar o lazuli-backend". Dois enganos meus:

1. **Excluí `.skies/` inteiro dos renames tratando como "memória".** ERRADO: `.skies/items` é memória (preservar), mas `.skies/agents`/`routines`/`skills`/`pipelines`/`loops` são **config VIVA**. (Neste caso os `.skies/agents` dos repos até estavam limpos — mas a regra mental era perigosa.)

2. **A fonte real dos nomes `lazuli-backend`/`lazuli-frontend` era o PLUGIN do framework servido em runtime**, não os repos. O agente/roteamento vem de `constellation/plugins/skies-framework/<subdir>/agents/*.md` + `context.md` (injetado no system prompt). Esse cache estava STALE porque:
   - O framework renomeado tinha **3 commits NÃO-pushados** (todo o rename era local) → o GitHub ainda servia o conteúdo velho.
   - O **registry `constellation/plugins.json`** apontava `source: lazuli-net.git` e `path: .../pleiades-plugin` (subdir velho). Meu fix de seeding (STD_GIT_PLUGINS em plugins.rs) só afeta seeding de instalação NOVA — não reescreve a entrada existente do registry.

**A cura (aplicada):**
- `git push origin main` no framework (de33c84..17a42c3). GitHub `lazuli-net.git` redireciona pra `skies-framework.git` (repo renomeado no GitHub), então fetch já traz o conteúdo novo.
- Corrigir o registry (AppData E dev-tree `plugins.json`): `source`→`skies-framework.git`, `path`→`.../skies-plugin`.
- `git fetch + reset --hard origin/main` nos dois clones de cache → subdir vira `skies-plugin`, agentes `skies-*`, context.md 0 lazuli.
- Remover o dir órfão `constellation/plugins/lazuli-net` (clone do seeding pré-fix).

**Como aplicar (geral):** rename de marca num plugin gerenciado por git NÃO termina no repo — só vale em runtime depois de (a) PUSHAR o repo do plugin, (b) corrigir a entrada EXISTENTE do registry (source+path), e (c) re-sincronizar/resetar o clone de cache. O harness precisa de restart/re-sync pra uma sessão NOVA carregar; sessões e instâncias de agente JÁ rodando mantêm os nomes antigos até retirarem (não derrubar trabalho em voo). Ver [[b54a3077]].
