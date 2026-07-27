---
id: 4ae30872-8936-44c1-9cb2-5234c5114946
slug: build
type: scar
title: PowerShell pipeline com Out-Host mascara o exit code de dotnet build
tags: powershell, exit-code, false-green, dotnet, smoke
provenance: observado
evidence: smoke skies-auth-smoke-e841... em 2026-07-12: CS0103 AppJson + tool exit 0; rerun com $LASTEXITCODE propagado
decay: stable
created: 2026-07-12T23:04:18.734971900+00:00
updated: 2026-07-12T23:04:18.734971900+00:00
validated: 2026-07-12T23:04:18.734971900+00:00
links: 
---

No smoke de auth, `dotnet build ... | Out-Host` falhou com CS0103, mas o script terminou com exit 0 porque o pipeline e um `Write-Output` posterior substituíram o código de saída. A ferramenta reportou sucesso embora o log contivesse `FALHA da compilação`. Em scripts de gate PowerShell, invoque `& dotnet ...` sem pipeline e teste imediatamente `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` após cada comando. Saída bonita nunca pode tomar o lugar do veredito.
