---
id: c6f1b722-b4f8-4a7d-9f08-920213f7d7ab
slug: geral
type: fact
title: O kit Pleiades da lazuli (pleiades-plugin/) é distribuído bundled no pleiades-harness — std git plugin, sincronizado a cada boot
tags: distribuicao, pleiades, plugin
provenance: observado
evidence: pleiades-harness src-tauri/src/plugins.rs STD_GIT_PLUGINS (v0.3.0)
decay: stable
created: 2026-06-11T23:02:06.917572+00:00
updated: 2026-06-11T23:02:06.917572+00:00
validated: 2026-06-11T23:02:06.917572+00:00
links: 
---

Desde o pleiades-harness v0.3.0 (2026-06-11), o kit `pleiades-plugin/` deste repo é plugin STANDARD VIA GIT da harness: toda instalação do Pleiades clona https://github.com/lucasrgt/lazuli-net.git pra `constellation/plugins/lazuli-net` no primeiro boot, registra habilitado globalmente (todos os workspaces da máquina) e dá `git pull --ff-only` a cada boot — consumidores nunca dessincronizam deste repo.

Implicação pra quem evolui o kit: o que entra na main deste repo chega automaticamente a todas as máquinas com Pleiades no próximo boot. Mudanças no manifest (`pleiades-plugin.json`), agentes, skills, rotinas e docs são "deploy" — tratar a main do kit como superfície publicada. O manifest declara `knowledgeHome: "lazuli-net"`: conhecimento sobre o framework federa pra esta rede quando o consumidor tem este repo registrado como workspace.
