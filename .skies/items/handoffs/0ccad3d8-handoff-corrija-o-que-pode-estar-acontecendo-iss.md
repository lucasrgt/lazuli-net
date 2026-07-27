---
id: 0ccad3d8-ad1e-4cb0-9dba-0285f798f5e6
slug: handoffs
type: doc
title: Handoff — corrija o que pode estar acontecendo isso no laz…
tags: echo
provenance: observado
evidence: echo 221817dc — ask_session: 221817dc-e284-43c0-aca7-8b927ade89b8
decay: seasonal
created: 2026-06-16T00:43:11.981519900+00:00
updated: 2026-06-16T00:43:11.981519900+00:00
validated: 2026-06-16T00:43:11.981519900+00:00
links: 
---

## Mapa da órbita anterior (memória de curto prazo)
```mermaid
graph TD
    GOAL["Complete Email.cs.cstmpl<br/>Auth Template Fix"]
    
    GOAL --> RESEARCH["Research Phase (n2-n33)<br/>✓ COMPLETE"]
    RESEARCH --> SPEC["Spec & Entities<br/>(n5-n13)"]
    RESEARCH --> FLOWS["Generators & Flows<br/>(n14-n33)"]
    
    GOAL --> MODIFIED["Email.cs.cstmpl<br/>Modified (n2, n9)"]
    
    SPEC --> ACTION["Apply Fix<br/>Reference: Handoff<br/>79806d57-corrija"]
    FLOWS --> ACTION
    MODIFIED --> ACTION
    
    ACTION --> VERIFY["Verify & Test"]
    
    DEADEND["✗ SKIP: Knowledge<br/>Search (n1)<br/>—No results"]
    
    classDef complete fill:#90EE90,stroke:#2D6A2D,stroke-width:2px
    classDef active fill:#FFD700,stroke:#FF6347,stroke-width:2px
    classDef note fill:#E6E6FA,stroke:#696996,stroke-width:2px
    classDef context fill:#87CEEB,stroke:#4682B4
    
    RESEARCH :::complete
    SPEC :::context
    FLOWS :::context
    ACTION :::active
    VERIFY :::active
    DEADEND :::note
```

Drill-down (atividade completa por node): C:\Users\lucas\AppData\Roaming\Pleiades\constellation\offload\ae0f1c60-2026-06-16T00-42-18-117470200-00-00.md
