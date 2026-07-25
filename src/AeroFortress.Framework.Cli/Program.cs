using AeroFortress.Framework.Cli;

return args switch
{
    ["new", var name] => Tooling.Dotnet("new", ["aerofortress", "-n", name]),
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
    ["nya", .. var rest] => NyaCommand.Run(rest),
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
        af — the AeroFortress convention CLI

        usage:
          af new <Name>                 scaffold a new AeroFortress project (dotnet new aerofortress)
          af g module <Name>            generate a module + wire it into Program.cs
          af g slice <Module> <Name> --verify <id,id>
                                        generate a slice + tests + complete write journeys; --verify
                                        declares the AVP criteria in <Module>.spec.toml and scaffolds the
                                        co-located [AVP] proof (red by design — correct by construction)
          af criteria list|suggest <words...>   the AVP catalog menu / ranked criteria for a slice
          af nya <args...>              run the pinned Not You Again CLI; downloads one verified binary on first use
          af g entity <Module> <Name>   generate a rich [Entity] — encapsulated, with an EnsureValid invariant funnel
          af g vo <Name>                generate an always-valid [ValueObject] in BuildingBlocks
          af g crud <Module> <Entity>   generate CRUD slices (list/lookup/create/update/delete +me) for a data-bag entity
          af g hub <Module> <Name>      generate a SignalR hub (real-time: typing/presence/live fan-out)
          af g auth [--skip-tenancy] [--skip-cookies]   generate the auth module (register/login/refresh/logout/me)
          af g auth:otp                 augment auth with phone verification by SMS code
          af g auth:oauth               augment auth with Google sign-up/sign-in
          af g auth:email               augment auth with email verification + password reset
          af doctor                     run the convention analyzers (build)
          af gate [--affected] [--base <rev>]
                                        run the Git-affected proof closure; an explicit base freezes base...HEAD
          af gate --staged --fast      bounded pre-commit gate; defers exhaustive fallbacks and browser/device execution
          af gate --affected --base <rev> --fast
                                        bounded local pre-push gate over base...HEAD
          af gate --full               run the exhaustive audit (required before a release)
                                        every mode runs the universal inventory and emits the honest matrix
          af gate --help               explain gate modes, local-change scope, and forwarded arguments
          af test [--unit|--integration|--e2e]   run the .NET tests (fast leg)
          af mutate                     run mutation testing via Stryker (deep leg)

        Run from the relevant project directory.
        """);
    return 1;
}
