namespace Skies.Framework.Doctor.Tests;

public class ModuleAnalyzerTests
{
    [Fact]
    public Task Conformant_registered_module_reports_nothing() =>
        Harness<ModuleAnalyzer>.Verify(Valid);

    [Fact]
    public Task Non_static_module_is_flagged() =>
        Harness<ModuleAnalyzer>.Verify(NotStatic);

    [Fact]
    public Task Module_without_AddServices_is_flagged() =>
        Harness<ModuleAnalyzer>.Verify(MissingAddServices);

    [Fact]
    public Task Module_left_unregistered_is_flagged() =>
        Harness<ModuleAnalyzer>.Verify(NotRegistered);

    // A static module declaring both halves, wired on both sides in the registry — the canonical shape.
    private const string Valid = """
        using System;

        [Module]
        public static class WalletsModule
        {
            public static int AddServices(int services, int configuration) => services;
            public static void Map(int app) { }
        }

        public static class Modules
        {
            public static void Wire(int services, int app)
            {
                WalletsModule.AddServices(services, 0);
                WalletsModule.Map(app);
            }
        }

        public sealed class ModuleAttribute : Attribute { }
        """;

    // Static methods present and wired, but the class itself is not static — SKY0015 (shape) only.
    private const string NotStatic = """
        using System;

        [Module]
        public class {|SKY0015:WalletsModule|}
        {
            public static int AddServices(int services, int configuration) => services;
            public static void Map(int app) { }
        }

        public static class Modules
        {
            public static void Wire(int services, int app)
            {
                WalletsModule.AddServices(services, 0);
                WalletsModule.Map(app);
            }
        }

        public sealed class ModuleAttribute : Attribute { }
        """;

    // Map is present and wired, but there is no AddServices — SKY0015 (shape) only, never a redundant SKY0016.
    private const string MissingAddServices = """
        using System;

        [Module]
        public static class {|SKY0015:WalletsModule|}
        {
            public static void Map(int app) { }
        }

        public static class Modules
        {
            public static void Wire(int app) => WalletsModule.Map(app);
        }

        public sealed class ModuleAttribute : Attribute { }
        """;

    // Conformant shape and mapped, but AddServices is never wired into the registry — SKY0016 (registration).
    private const string NotRegistered = """
        using System;

        [Module]
        public static class {|SKY0016:WalletsModule|}
        {
            public static int AddServices(int services, int configuration) => services;
            public static void Map(int app) { }
        }

        public static class Modules
        {
            public static void Wire(int app) => WalletsModule.Map(app);
        }

        public sealed class ModuleAttribute : Attribute { }
        """;
}
