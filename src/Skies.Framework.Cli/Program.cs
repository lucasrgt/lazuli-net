using Skies.Framework.Cli;

return args switch
{
    ["new", var name] => ProjectTemplate.Scaffold(name),
    ["g", "module", var name] => ModuleGenerator.Generate(Directory.GetCurrentDirectory(), name),
    ["g", "slice", var module, var name, .. var flags] => SliceGenerator.Run(module, name, flags),
    ["g", "entity", var module, var name] => EntityGenerator.Generate(Directory.GetCurrentDirectory(), module, name),
    ["g", "vo", var name] => ValueObjectGenerator.Generate(Directory.GetCurrentDirectory(), name),
    ["g", "crud", var module, var entity] => CrudGenerator.Generate(Directory.GetCurrentDirectory(), module, entity),
    ["g", "hub", var module, var name] => HubGenerator.Generate(Directory.GetCurrentDirectory(), module, name),
    ["g", "auth", .. var flags] => AuthGenerator.Generate(Directory.GetCurrentDirectory(), skipTenancy: flags.Contains("--skip-tenancy"), skipCookies: flags.Contains("--skip-cookies")),
    ["g", "auth:otp"] => AuthFlowGenerator.Generate(Directory.GetCurrentDirectory(), AuthFlow.Otp),
    ["g", "auth:oauth"] => AuthFlowGenerator.Generate(Directory.GetCurrentDirectory(), AuthFlow.OAuth),
    ["g", "auth:email"] => AuthFlowGenerator.Generate(Directory.GetCurrentDirectory(), AuthFlow.Email),
    ["criteria", .. var rest] => CriteriaCommand.Run(rest),
    ["foundations", .. var rest] => FoundationStackCommand.Run(rest),
    ["context", .. var rest] => FoundationWorkflowCommand.Context(rest),
    ["check", .. var rest] => FoundationWorkflowCommand.Check(rest),
    ["nya", .. var rest] => NyaCommand.Run(rest),
    ["wtw", .. var rest] => WtwCommand.Run(rest),
    ["rtw", .. var rest] => RtwCommand.Run(rest),
    ["nwc", .. var rest] => NwcCommand.Run(rest),
    ["doctor", .. var rest] => DoctorCommand.Run(rest),
    ["gate", .. var rest] => GateCommand.Run(rest),
    ["mutate", .. var rest] => Tooling.Dotnet("stryker", rest),
    ["test", .. var rest] => Tooling.Dotnet("test", TestArgs(rest)),
    _ => Usage(),
};

// The fast leg: dotnet test, with a category shorthand. --unit/--integration/--e2e map to the
// xUnit Category trait so a single layer can be run; anything else is passed straight through.
static string[] TestArgs(string[] rest) => rest switch
{
    ["--unit", .. var more] => ["--filter", "Category=Unit", .. more],
    ["--integration", .. var more] => ["--filter", "Category=Integration", .. more],
    ["--e2e", .. var more] => ["--filter", "Category=E2E", .. more],
    _ => rest,
};

static int Usage()
{
    Console.Error.WriteLine(
        """
        skies — the Skies convention CLI

        usage:
          skies new <Name>                 scaffold a new Skies project (dotnet new skies)
          skies g module <Name>            generate a module + wire it into Program.cs
          skies g slice <Module> <Name> --verify <id,id>
                                        generate a slice + tests + complete write journeys; --verify
                                        declares the AVP criteria in <Module>.spec.toml and scaffolds the
                                        co-located [AVP] proof (red by design — correct by construction)
          skies criteria list|suggest <words...>   the AVP catalog menu / ranked criteria for a slice
          skies foundations init [--agent-file <path>]...
                                        initialize every repository-local agent foundation
          skies foundations sync [--agent-file <path>]...
                                        consolidate agent instructions into one managed workflow
          skies context --task <goal> [--path <path>]...
                                        recall bounded decisions, ways, scars, and due work once
          skies check --task <work> (--staged|--affected|--base <revision>|--full) [--fast]
                                        run AVP + WTW + RTW + NYA + NWC as one fail-closed receipt
          skies nya <args...>              run CSM-managed Not You Again
          skies wtw <args...>              run CSM-managed Why This Way
          skies rtw <args...>              run CSM-managed Right This Way
          skies nwc <args...>              run CSM-managed Now We Can
          skies g entity <Module> <Name>   generate a rich [Entity] — encapsulated, with an EnsureValid invariant funnel
          skies g vo <Name>                generate an always-valid [ValueObject] in BuildingBlocks
          skies g crud <Module> <Entity>   generate CRUD slices (list/lookup/create/update/delete +me) for a data-bag entity
          skies g hub <Module> <Name>      generate a SignalR hub (real-time: typing/presence/live fan-out)
          skies g auth [--skip-tenancy] [--skip-cookies]   generate the auth module (register/login/refresh/logout/me)
          skies g auth:otp                 augment auth with phone verification by SMS code
          skies g auth:oauth               augment auth with Google sign-up/sign-in
          skies g auth:email               augment auth with email verification + password reset
          skies doctor                     run the convention analyzers (build)
          skies gate [--affected] [--base <rev>]
                                        run the Git-affected proof closure; an explicit base freezes base...HEAD
          skies gate --staged --fast      bounded pre-commit gate; defers exhaustive fallbacks and browser/device execution
          skies gate --affected --base <rev> --fast
                                        bounded local pre-push gate over base...HEAD
          skies gate --full               run the exhaustive audit (required before a release)
                                        every mode runs the universal inventory and emits the honest matrix
          skies gate --help               explain gate modes, local-change scope, and forwarded arguments
          skies test [--unit|--integration|--e2e]   run the .NET tests (fast leg)
          skies mutate                     run mutation testing via Stryker (deep leg)

        Run from the relevant project directory.
        """);
    return 1;
}
