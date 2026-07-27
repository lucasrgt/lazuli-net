namespace Skies.Framework.Doctor.Tests;

public class NoRepositoryAnalyzerTests
{
    [Fact]
    public Task A_slice_reading_the_dbcontext_directly_reports_nothing() =>
        Harness<NoRepositoryAnalyzer>.Verify("""
            class Deposit
            {
                static void Handle(AppDb db) { _ = db; }
            }
            class AppDb { }
            """);

    // A type whose name merely contains the word elsewhere is fine — only the layer-naming suffix matches.
    [Fact]
    public Task A_type_that_only_contains_the_word_reports_nothing() =>
        Harness<NoRepositoryAnalyzer>.Verify("""
            class RepositoryMetadata { }
            """);

    [Fact]
    public Task A_repository_interface_is_flagged() =>
        Harness<NoRepositoryAnalyzer>.Verify("""
            interface {|SKY0006:IUserRepository|} { }
            """);

    [Fact]
    public Task A_repository_class_is_flagged() =>
        Harness<NoRepositoryAnalyzer>.Verify("""
            class {|SKY0006:OrderRepository|} { }
            """);

    [Fact]
    public Task A_unit_of_work_interface_is_flagged() =>
        Harness<NoRepositoryAnalyzer>.Verify("""
            interface {|SKY0006:IUnitOfWork|} { }
            """);
}
