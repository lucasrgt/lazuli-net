---
name: why-this-way
description: Preserve and retrieve repository decisions and invariants.
---

# Why This Way

Use `dotnet tool run af wtw explain` before editing to retrieve governing decisions and
invariants. Read their authority, rationale, alternatives, violation examples,
and links before choosing an implementation.

Hosts call `dotnet tool run af wtw collect` after an authoritative source contains a durable
choice or falsifiable invariant. There is no manual add command. Two isolated
judges must return the same evidence-backed candidate before it is written.

Run `dotnet tool run af wtw guard` before completion. A malformed record, conflicting local
relation, dangling WTW URI, or suite-mode invariant without an inbound proof
is a blocking health failure.
