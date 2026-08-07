<!-- managed by @skiesjs/foundation; run `skies-node-foundation foundations sync` -->
# WTW — decisions and invariants

This is the repository-local Node foundation surface. Do not install or invoke an ambient CSM binary.

Use `skies-node-foundation wtw explain` only when deeper decision inspection is needed. Read the returned authority, rationale, alternatives, violation examples, and links before choosing an implementation.

WTW records are written only by the host through the shared CSM host collection after an authoritative source contains a durable choice or falsifiable invariant. This Node surface has no manual add command: `skies-node-foundation wtw collect` does not exist. Two isolated judges must return the same evidence-backed candidate before a record is written.

Use `skies-node-foundation wtw guard` only for focused investigation or maintenance. The standard `skies-node-foundation check` receipt already runs it and treats a malformed record, conflicting local relation, dangling WTW URI, or suite-mode invariant without an inbound proof as a blocking health failure.

- `skies-node-foundation context --task "<goal>"`
- `skies-node-foundation check --task "<goal>" --affected`
