---
id: f7559b6d-a4fb-4928-848e-149ab0416261
slug: reference
type: rule
title: Test response DTOs must type enum fields as string (Lazuli serializes enums as names)
tags: testing, json, enums, lazuli, doctor
provenance: observado
evidence: 3 Catalog journey tests failed with JsonException at ReadFromJsonAsync (Path $.category/$.status/$.kind); fixed by string DTO fields + nameof() asserts. Build green after adding using Fluxoterra.Api.BuildingBlocks.
decay: stable
created: 2026-06-18T03:41:09.835138500+00:00
updated: 2026-06-18T03:41:09.835138500+00:00
validated: 2026-06-18T03:41:09.835138500+00:00
links: 
---

`AddLazuli()` configures System.Text.Json to serialize enums as their NAME (e.g. `"Premium"`, `"Resolved"`, `"MainProduct"`), but a test's `HttpResponseMessage.Content.ReadFromJsonAsync<TDto>()` uses DEFAULT options (enums-as-numbers). So a test DTO that declares an **enum-typed** field throws `System.Text.Json.JsonException: The JSON value could not be converted to … Path: $.<field>` when the server sends the string name.

**Rule:** in co-located `*.Tests.cs`, type every enum field of a response DTO as `string` and assert against `nameof(MyEnum.Value)` (entity-side reads from the DB can stay strongly typed). This mirrors the working convention in `PublicValuationIndexTests` (`string Band/Category/Value`).

**Why:** failed silently for a whole session — the CM2 curation test files (`ResolveDeposition`/`SetResidueApplicationCategory`/`AddCatalogSynonym` `.Tests.cs`) compiled only as doctor `AdditionalFiles` (LZ0003/LZ0008 parse them, never compile), so the latent enum-DTO bug + a missing `using Fluxoterra.Api.BuildingBlocks;` (Email/PasswordHash live there) surfaced only when the TEST PROJECT first compiled them.

**How to apply:** when authoring or reviewing a Lazuli slice test that deserializes the response: enum fields → `string`; verify the test file actually compiles into the test project (build the solution, not just the API), not just that the analyzer is happy.
