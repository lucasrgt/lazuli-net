---
id: 3d49a75f-13bf-4199-a711-94843476bf73
slug: frontend
type: scar
title: orval client-scaffold: query:{useQuery,useMutation} forces ALL ops to useQuery on orval 8.20 (writes lose mutation shape)
tags: 
provenance: observado
evidence: frontend-sdk/tools/client-scaffold.mjs renderOrvalConfig; reproduced generating marombas-app client from Marombas.Api.json with orval 8.20.0 — useLogin/useCreateMeal/useUpsertDailyLog all emitted as useQuery (UseQueryResult) with query:{useQuery:true,useMutation:true}; removing the override restored GET→useQuery, POST/PUT/PATCH/DELETE→useMutation ({data:Input} vars).
decay: stable
created: 2026-07-07T03:16:22.441122800+00:00
updated: 2026-07-07T03:16:22.441122800+00:00
validated: 2026-07-07T03:16:22.441122800+00:00
links: 
---

The blessed orval config that `tools/client-scaffold.mjs` renders sets:

```
override: { query: { useQuery: true, useMutation: true }, mutator: {...} }
```

On **orval 8.20.0** that flag pair does NOT mean "GET→query, writes→mutation". It forces EVERY operation — including POST/PUT/PATCH/DELETE — to be generated as a `useQuery` hook (returns `UseQueryResult`, no `.mutate`, no `isPending`/`isSuccess`). This silently breaks the entire write path: the deposit/form recipe (`submitOrReveal` + `mutation.mutate` + SKYFE013 mutation-error-handled + SKYFE027 mutation defaults) cannot bind to a query hook.

**Cure:** remove the `query: { useQuery, useMutation }` override entirely. orval's verb-based default then generates GET→`useQuery`, writes→`useMutation` (mutation variables shaped `{ data: <Input> }`). The generated mutation *options builders* (`getXMutationOptions`) are emitted either way — the flag only changes which one the exported `useX` hook actually calls.

**How to avoid:** fix `renderOrvalConfig` in the frontend-sdk to drop the flag pair (or pin the orval version + document the exact semantics). Any Skies app that ran the scaffold verbatim has a client where writes are queries — regenerate after the fix. Belongs in the framework; ship via package-first. Related: [[digesto-frontend]].
