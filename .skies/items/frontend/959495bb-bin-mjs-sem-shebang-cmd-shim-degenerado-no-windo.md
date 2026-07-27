---
id: 959495bb-406b-4b5b-9046-6d9626d7cdb2
slug: frontend
type: scar
title: Bin .mjs sem shebang → cmd-shim degenerado no Windows → ShellExecute abre VS Code e o npm pendura pra sempre
tags: shebang, cmd-shim, windows, npm-hang, bin, sensor-candidato
provenance: observado
evidence: framework@2b02c83; shim degenerado em pauta clients/pauta-web/node_modules/.bin/skyfe-endpoint-coverage.cmd; Code processes 01:42:59 = mtime do último log
decay: stable
created: 2026-07-02T04:48:01.936646500+00:00
updated: 2026-07-02T04:48:01.936646500+00:00
validated: 2026-07-02T04:48:01.936646500+00:00
links:
---

**Sintoma (2026-07-02, dogfood do skies gate no pauta):** `npm run lint` travava indefinidamente (2 runs de ~40min) na etapa `skyfe-endpoint-coverage`, com VS Code abrindo "do nada" (10 processos Code num segundo). Interativamente o time só via um editor piscar; sob stdio em PIPE (skies/CI/background) o npm nunca sai.

**Causa-raiz:** `frontend-sdk/tools/endpoint-coverage.mjs` era o ÚNICO bin sem `#!/usr/bin/env node` (todos os irmãos têm). O cmd-shim do npm decide o formato pelo shebang do alvo: sem ele, gera o shim DEGENERADO que invoca o `.mjs` direto — e o cmd.exe faz ShellExecute do arquivo → abre no handler default (VS Code) → o editor herda os pipes do npm → o npm espera os pipes fecharem → hang eterno.

**Fix:** shebang adicionado (framework@2b02c83). Entrega real pros pilots = próximo publish do @skies/frontend-sdk + reinstall (o shim regenera). Unblock local imediato: editar o `.cmd` instalado prefixando `node` (node_modules, não commitado).

**Lição (classe):** TODO entrypoint declarado em `bin` precisa do shebang node — e o sintoma da falta é bizarro à distância (editor abrindo + hang só em pipe). Checagem barata de candidata a sensor/SKYSELF: todo arquivo referenciado em `bin` de qualquer package.json do SDK começa com `#!/usr/bin/env node`. Diagnóstico que funcionou: árvore de processos (npm sem filhos + Code nascendo no timestamp do último log) → shim → shebang.
