# Migrating to Skies 4.0

Skies 4.0 is a clean product rename and a breaking package migration. Runtime
behavior and the convention model remain the same, but every public identity
now belongs to Skies. The previous package line is frozen and receives no new
features.

## Identity map

| Before 4.0 | Skies 4.0 |
|---|---|
| `lucasrgt/aerofortress-framework` | `lucasrgt/skies` |
| `AeroFortress.Framework.*` | `Skies.Framework.*` |
| `aerofortress-framework-cli` | `skies-framework-cli` |
| `af` | `skies` |
| `AeroFortress.toml` | `Skies.toml` |
| `.aerofortress/` | `.skies/` |
| `dotnet new aerofortress` | `dotnet new skies` |
| `@aerofortress/frontend-sdk` | `skies-frontend-sdk` |
| `@aerofortress/react` | `skies-react` |
| `eslint-plugin-aerofortress` | `eslint-plugin-skies` |
| `@aerofortress/assay` | `avp-assay` |
| `AF####` | `SKY####` |
| `AFFE###` | `SKYFE###` |
| `AFSELF###` | `SKYSELF###` |

Public namespaces, assembly names, project names, generated code, analyzer
identifiers, and template identities follow the same mapping.

## Application APIs

| Before 4.0 | Skies 4.0 |
|---|---|
| `AddAeroFortress()` | `AddSkies()` |
| `UseAeroFortress()` | `UseSkies()` |
| `AeroFortressExtensions` | `SkiesExtensions` |
| `AeroFortressManifest` | `SkiesManifest` |

## Upgrade an existing repository

1. Replace every `AeroFortress.Framework.*` package reference with the matching
   `Skies.Framework.*` package at version `4.0.1`.
2. Replace the tool package and command:

   ```bash
   dotnet tool uninstall -g aerofortress-framework-cli
   dotnet tool install -g skies-framework-cli --version 4.0.1
   ```

3. Rename `AeroFortress.toml` to `Skies.toml` and `.aerofortress/` to
   `.skies/`.
4. Replace namespaces and application APIs using the maps above.
5. Replace frontend package names, refresh the npm lockfile, and update
   `AFFE` suppressions or rule references to `SKYFE`.
6. Update CI paths, cache dependency paths, hooks, and scripts to use the new
   solution, projects, CLI, and manifest.
7. Run the complete gate:

   ```bash
   skies foundations init
   skies gate --full
   ```

`skies foundations init` adopts the complete AVP, NYA, WTW, RTW, and NWC
foundation contract. Skies projects do not select a subset of that stack.

The GitHub repository rename preserves standard GitHub redirects, but package
identities do not redirect. Consumers must move to the Skies package line
explicitly.
