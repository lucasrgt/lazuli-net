namespace Skies.Framework.Doctor.Tests;

public class SliceConformanceAnalyzerTests
{
    [Fact]
    public Task Conformant_slice_reports_nothing() =>
        Harness<SliceConformanceAnalyzer>.Verify(Conformant);

    [Fact]
    public Task Non_static_slice_is_flagged() =>
        Harness<SliceConformanceAnalyzer>.Verify(NonStatic);

    [Fact]
    public Task Slice_without_an_input_is_flagged() =>
        Harness<SliceConformanceAnalyzer>.Verify(NoInput);

    [Fact]
    public Task Slice_with_members_out_of_order_is_flagged() =>
        Harness<SliceConformanceAnalyzer>.Verify(OutOfOrder);

    private const string Conformant = """
        using System;
        using System.Threading.Tasks;

        [Slice]
        public static class Deposit
        {
            public record Input(int X);
            public record Output(int Y);
            public static Task<Result<Output>> Handle(Input input) => Task.FromResult(default(Result<Output>));
            public static void Map() { }
        }

        public sealed class SliceAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string NonStatic = """
        using System;
        using System.Threading.Tasks;

        [Slice]
        public class {|SKY0001:Deposit|}
        {
            public record Input(int X);
            public record Output(int Y);
            public static Task<Result<Output>> Handle(Input input) => Task.FromResult(default(Result<Output>));
            public static void Map() { }
        }

        public sealed class SliceAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string NoInput = """
        using System;
        using System.Threading.Tasks;

        [Slice]
        public static class {|SKY0001:Deposit|}
        {
            public record Output(int Y);
            public static Task<Result<Output>> Handle(Output input) => Task.FromResult(default(Result<Output>));
            public static void Map() { }
        }

        public sealed class SliceAttribute : Attribute { }
        public struct Result<T> { }
        """;

    private const string OutOfOrder = """
        using System;
        using System.Threading.Tasks;

        [Slice]
        public static class {|SKY0001:Deposit|}
        {
            public static Task<Result<Output>> Handle(Input input) => Task.FromResult(default(Result<Output>));
            public record Input(int X);
            public record Output(int Y);
            public static void Map() { }
        }

        public sealed class SliceAttribute : Attribute { }
        public struct Result<T> { }
        """;
}
