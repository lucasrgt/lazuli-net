#!/usr/bin/env bash
# auth-smoke — render the auth blueprint (+ email/otp variants) into a throwaway app, then compile it
# and run its co-located tests. This is the regression guard the round-1 audit lacked: the SKY0022 break
# (a generated app that did not compile) slipped through because nothing rendered the templates and built.
#
# Two legs:
#   1. DOCTOR leg  — build the rendered API with the SKY* analyzers ON and assert it is doctor-CLEAN:
#                    the build succeeds and reports zero SKY diagnostics (errors or warnings). The generated
#                    auth scaffold holds the full convention — slice shape, [Entity] encapsulation,
#                    concurrency tokens, journeys — so any regression that reintroduces an SKY finding fails here.
#   2. COMPILE+TEST leg — build + run the generated test suite with analyzers OFF, to prove the rendered
#                    C# compiles and every shipped *.Tests.cs passes.
#
# Uses ProjectReferences to the freshly-built Skies.Framework.* projects (not the package feed), so it tests the
# working tree. Headless; no Docker (the in-memory provider backs the tests). Run from the repo root.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_WIN="$(cd "$REPO" && pwd -W 2>/dev/null || echo "$REPO")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> building the CLI (carries the templates)"
dotnet build "$REPO/src/Skies.Framework.Cli/Skies.Framework.Cli.csproj" -c Debug >/dev/null
CLI="$REPO/src/Skies.Framework.Cli/bin/Debug/net10.0/Skies.Framework.Cli.dll"

mkdir -p "$WORK/src/Smoke.Api" "$WORK/tests/Smoke.Tests"

cat > "$WORK/src/Smoke.Api/Smoke.Api.csproj" <<EOF
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="$REPO_WIN/src/Skies.Framework.Abstractions/Skies.Framework.Abstractions.csproj" />
    <ProjectReference Include="$REPO_WIN/src/Skies.Framework.AspNetCore/Skies.Framework.AspNetCore.csproj" />
    <ProjectReference Include="$REPO_WIN/src/Skies.Framework.Auth/Skies.Framework.Auth.csproj" />
    <ProjectReference Include="$REPO_WIN/src/Skies.Framework.Mail/Skies.Framework.Mail.csproj" />
    <ProjectReference Include="$REPO_WIN/src/Skies.Framework.Sms/Skies.Framework.Sms.csproj" />
    <ProjectReference Include="$REPO_WIN/analyzers/Skies.Framework.Doctor/Skies.Framework.Doctor.csproj" OutputItemType="Analyzer" ReferenceOutputAssembly="false" />
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="10.0.8" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.InMemory" Version="10.0.8" />
    <PackageReference Include="Konscious.Security.Cryptography.Argon2" Version="1.3.1" />
  </ItemGroup>
  <ItemGroup>
    <Compile Remove="**/*.Tests.cs" />
    <AdditionalFiles Include="**/*.Tests.cs" />
    <AdditionalFiles Include="**/*.ctx.md" />
  </ItemGroup>
</Project>
EOF

printf 'global using Skies.Framework.Abstractions;\nglobal using Skies.Framework.AspNetCore;\n' > "$WORK/src/Smoke.Api/GlobalUsings.cs"
printf 'var builder = WebApplication.CreateBuilder(args);\n\nvar app = builder.Build();\n\napp.Run();\n' > "$WORK/src/Smoke.Api/Program.cs"

cat > "$WORK/tests/Smoke.Tests/Smoke.Tests.csproj" <<EOF
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="3.1.4" />
  </ItemGroup>
  <ItemGroup>
    <Using Include="Xunit" />
    <Using Include="Skies.Framework.Abstractions" />
    <Using Include="Skies.Framework.Testing" />
    <ProjectReference Include="../../src/Smoke.Api/Smoke.Api.csproj" />
    <ProjectReference Include="$REPO_WIN/src/Skies.Framework.Testing/Skies.Framework.Testing.csproj" />
    <ProjectReference Include="$REPO_WIN/src/Skies.Framework.Testing.InMemory/Skies.Framework.Testing.InMemory.csproj" />
  </ItemGroup>
  <ItemGroup>
    <Compile Include="../../src/Smoke.Api/**/*.Tests.cs" />
  </ItemGroup>
</Project>
EOF

echo "==> rendering auth + auth:email + auth:otp"
( cd "$WORK/src/Smoke.Api" && dotnet "$CLI" g auth >/dev/null && dotnet "$CLI" g auth:email >/dev/null && dotnet "$CLI" g auth:otp >/dev/null )

echo "==> DOCTOR leg: build with analyzers ON, assert a clean doctor (zero SKY diagnostics)"
if DOCTOR_OUT="$(dotnet build "$WORK/src/Smoke.Api/Smoke.Api.csproj" -c Debug 2>&1)"; then
  DOCTOR_BUILD_OK=1
else
  DOCTOR_BUILD_OK=0
fi
LZ_FINDINGS="$(echo "$DOCTOR_OUT" | grep -oE "(error|warning) SKY[0-9]+" | sort | uniq -c | sort -rn || true)"
if [ "$DOCTOR_BUILD_OK" -ne 1 ] || [ -n "$LZ_FINDINGS" ]; then
  echo "FAIL: the generated app must build doctor-clean (zero SKY diagnostics). Reported:"
  echo "${LZ_FINDINGS:-<no SKY findings — the build failed for another reason, see below>}"
  echo "$DOCTOR_OUT" | grep -E "error|warning|SKY[0-9]+" | head -40
  exit 1
fi
echo "ok: doctor is clean — the generated app builds with zero SKY diagnostics."

echo "==> COMPILE+TEST leg: build + run generated tests (analyzers off)"
dotnet test "$WORK/tests/Smoke.Tests/Smoke.Tests.csproj" -p:RunAnalyzers=false

echo "==> auth-smoke OK"
