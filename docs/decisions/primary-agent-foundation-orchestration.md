# Primary agent foundation orchestration

## Decision

The primary coding agent owns the complete Skies foundation lifecycle. It uses one bounded context command before work and one comprehensive check command before completion. The foundation tools remain independent, versioned engines underneath that workflow.

This decision supersedes the earlier requirement to invoke WTW directly before work and completion. It also supersedes the earlier framing that consumers should orchestrate each foundation independently.

## Required workflow

Before implementation, the primary agent runs:

```text
skies context --task "<task>"
```

Before commit, pull request creation, push, or any completion claim, the same agent runs:

```text
skies check --task "<task>"
```

The agent may call an individual foundation command when it needs deeper inspection, collection, or maintenance, but it must not delegate one permanent agent to each foundation.

## Rationale

A single orchestration surface keeps context bounded, preserves the independent semantics of every foundation, and avoids multiplying agent context and token usage. The deterministic Skies host still executes every required final check and fails closed when any foundation blocks.

## Rejected alternatives

We rejected assigning one specialist agent to NYA, WTW, RTW, NWC, and AVP because the duplicated context and coordination cost would scale with the number of foundations.

We rejected merging the foundation engines into Skies because each tool must remain usable by other languages, frameworks, agents, and repositories.

We rejected relying only on prose instructions because compaction and long tasks can remove or dilute those instructions.

## Invariants

The primary agent retrieves bounded foundation context with `skies context` before implementation.

The primary agent runs the complete fail-closed `skies check` before completion.

Standalone foundation commands are escalation paths, not separate permanent agent roles.
