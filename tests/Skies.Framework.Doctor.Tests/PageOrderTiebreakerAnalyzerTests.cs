namespace Skies.Framework.Doctor.Tests;

public class PageOrderTiebreakerAnalyzerTests
{
    [Fact]
    public Task A_non_unique_final_key_with_no_tiebreaker_is_flagged() =>
        Harness<PageOrderTiebreakerAnalyzer>.Verify("""
            using System.Linq;
            using Skies.Framework.Abstractions;
            using Skies.Framework.EntityFrameworkCore;
            using Microsoft.EntityFrameworkCore;

            [Slice]
            static class ListReviews
            {
                static async System.Threading.Tasks.Task Handle(Db db, System.Threading.CancellationToken ct)
                {
                    var page = await db.Wallets.{|SKY0028:OrderByDescending|}(w => w.CreatedAt).ToPageAsync(1, 20, ct: ct);
                }
            }
            """ + Stubs);

    [Fact]
    public Task A_then_by_id_tiebreaker_silences() =>
        Harness<PageOrderTiebreakerAnalyzer>.Verify("""
            using System.Linq;
            using Skies.Framework.Abstractions;
            using Skies.Framework.EntityFrameworkCore;
            using Microsoft.EntityFrameworkCore;

            [Slice]
            static class ListReviews
            {
                static async System.Threading.Tasks.Task Handle(Db db, System.Threading.CancellationToken ct)
                {
                    var page = await db.Wallets.OrderByDescending(w => w.CreatedAt).ThenBy(w => w.Id).ToPageAsync(1, 20, ct: ct);
                }
            }
            """ + Stubs);

    [Fact]
    public Task An_order_by_id_alone_is_already_total() =>
        Harness<PageOrderTiebreakerAnalyzer>.Verify("""
            using System.Linq;
            using Skies.Framework.Abstractions;
            using Skies.Framework.EntityFrameworkCore;
            using Microsoft.EntityFrameworkCore;

            [Slice]
            static class ListWallets
            {
                static async System.Threading.Tasks.Task Handle(Db db, System.Threading.CancellationToken ct)
                {
                    var page = await db.Wallets.OrderBy(w => w.Id).ToPageAsync(1, 20, ct: ct);
                }
            }
            """ + Stubs);

    [Fact]
    public Task A_foreign_key_terminal_is_not_a_tiebreaker() =>
        Harness<PageOrderTiebreakerAnalyzer>.Verify("""
            using System.Linq;
            using Skies.Framework.Abstractions;
            using Skies.Framework.EntityFrameworkCore;
            using Microsoft.EntityFrameworkCore;

            [Slice]
            static class ListByCustomer
            {
                static async System.Threading.Tasks.Task Handle(Db db, System.Threading.CancellationToken ct)
                {
                    // CustomerId ends in Id but many wallets share one customer — not unique, still flagged.
                    var page = await db.Wallets.OrderBy(w => w.Name).{|SKY0028:ThenBy|}(w => w.CustomerId).ToPageAsync(1, 20, ct: ct);
                }
            }
            """ + Stubs);

    [Fact]
    public Task The_entitys_own_conventional_key_silences() =>
        Harness<PageOrderTiebreakerAnalyzer>.Verify("""
            using System.Linq;
            using Skies.Framework.Abstractions;
            using Skies.Framework.EntityFrameworkCore;
            using Microsoft.EntityFrameworkCore;

            [Slice]
            static class ListWallets
            {
                static async System.Threading.Tasks.Task Handle(Db db, System.Threading.CancellationToken ct)
                {
                    // WalletId on Wallet is the EF-conventional primary key name — unique.
                    var page = await db.Wallets.OrderBy(w => w.WalletId).ToPageAsync(1, 20, ct: ct);
                }
            }
            """ + Stubs);

    [Fact]
    public Task A_unique_key_anywhere_in_the_chain_makes_the_order_total() =>
        Harness<PageOrderTiebreakerAnalyzer>.Verify("""
            using System.Linq;
            using Skies.Framework.Abstractions;
            using Skies.Framework.EntityFrameworkCore;
            using Microsoft.EntityFrameworkCore;

            [Slice]
            static class ListWallets
            {
                static async System.Threading.Tasks.Task Handle(Db db, System.Threading.CancellationToken ct)
                {
                    // Nothing below a unique primary key ever ties — ThenBy(Name) never decides anything.
                    var page = await db.Wallets.OrderBy(w => w.Id).ThenBy(w => w.Name).ToPageAsync(1, 20, ct: ct);
                }
            }
            """ + Stubs);

    [Fact]
    public Task A_pre_ordered_local_the_rule_cannot_read_stays_silent() =>
        Harness<PageOrderTiebreakerAnalyzer>.Verify("""
            using System.Linq;
            using Skies.Framework.Abstractions;
            using Skies.Framework.EntityFrameworkCore;
            using Microsoft.EntityFrameworkCore;

            [Slice]
            static class ListWallets
            {
                static async System.Threading.Tasks.Task Handle(Db db, System.Threading.CancellationToken ct)
                {
                    // The documented limitation: the keys live in another statement; silence over noise.
                    var ordered = db.Wallets.OrderBy(w => w.Name);
                    var page = await ordered.ToPageAsync(1, 20, ct: ct);
                }
            }
            """ + Stubs);

    [Fact]
    public Task Outside_a_slice_the_rule_stays_silent() =>
        Harness<PageOrderTiebreakerAnalyzer>.Verify("""
            using System.Linq;
            using Skies.Framework.EntityFrameworkCore;
            using Microsoft.EntityFrameworkCore;

            static class Seeder
            {
                static async System.Threading.Tasks.Task Run(Db db, System.Threading.CancellationToken ct)
                {
                    var page = await db.Wallets.OrderBy(w => w.CreatedAt).ToPageAsync(1, 20, ct: ct);
                }
            }
            """ + Stubs);

    // A tiny stand-in for the EF + Skies surface so the tests need no package references; the rule
    // matches ToPageAsync and the ordering chain syntactically, plus the lambda parameter's type name
    // for the {Entity}Id conventional key.
    private const string Stubs = """


        namespace Skies.Framework.Abstractions
        {
            public sealed class SliceAttribute : System.Attribute { }
        }

        namespace Skies.Framework.EntityFrameworkCore
        {
            public static class QueryablePageExtensions
            {
                public static System.Threading.Tasks.Task<int> ToPageAsync<T>(
                    this System.Linq.IOrderedQueryable<T> query, int pageNumber, int pageSize,
                    int maxPageSize = 100, System.Threading.CancellationToken ct = default) => null!;
            }
        }

        namespace Microsoft.EntityFrameworkCore
        {
            public class DbSet<T> : System.Linq.IQueryable<T>
            {
                public System.Type ElementType => typeof(T);
                public System.Linq.Expressions.Expression Expression => null!;
                public System.Linq.IQueryProvider Provider => null!;
                public System.Collections.Generic.IEnumerator<T> GetEnumerator() => null!;
                System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => null!;
            }
        }

        class Db
        {
            public Microsoft.EntityFrameworkCore.DbSet<Wallet> Wallets => null!;
        }

        class Wallet
        {
            public System.Guid Id { get; set; }
            public System.Guid WalletId { get; set; }
            public System.Guid CustomerId { get; set; }
            public string Name { get; set; } = "";
            public System.DateTime CreatedAt { get; set; }
        }
        """;
}
