<!-- skies-node:foundations:start -->
## Skies Node foundations

Use only the repository-owned foundation assets beneath the storage root declared in `csm.json`.
Before implementation, run `skies-node-foundation context --task "<goal>" --path "<path>"`.
Before handoff, run one explicitly scoped review:

- `skies-node-foundation check --task "<goal>" --affected`
- `skies-node-foundation check --task "<goal>" --base`
- `skies-node-foundation check --task "<goal>" --full`

A skipped, missing, unknown, or timed-out proof is never a pass. Run foundation commands through
`skies-node-foundation`; do not invoke an ambient NWC, NYA, RTW, or WTW installation.
<!-- skies-node:foundations:end -->
