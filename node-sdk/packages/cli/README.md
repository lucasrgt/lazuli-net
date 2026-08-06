# @skiesjs/cli

The initial Node.js slice generator. Its binary is deliberately `skies-node`, avoiding a collision with the .NET
`skies` global tool and the unrelated npm package named `skies`.

```bash
skies-node g slice Billing CreateInvoice --method post --route /invoices
```

The command creates the slice and its co-located test beneath `src/modules/billing/slices`. It refuses overwrites.
Use `--dry-run` to inspect paths without writing them.
