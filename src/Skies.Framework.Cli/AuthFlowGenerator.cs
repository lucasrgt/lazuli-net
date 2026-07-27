using System.Linq;

namespace Skies.Framework.Cli;

/// <summary>The three provider-backed auth sub-flows a generated Account module can be augmented with.</summary>
public enum AuthFlow
{
    /// <summary>Phone verification by one-time SMS code (<c>Skies.Framework.Sms</c>).</summary>
    Otp,

    /// <summary>Sign-up / sign-in with an external OIDC identity, e.g. Google (<c>Skies.Framework.Identity</c>).</summary>
    OAuth,

    /// <summary>Email verification + password reset by emailed token (<c>Skies.Framework.Mail</c>).</summary>
    Email,
}

/// <summary>
/// Augments an already-scaffolded Account module (from <c>skies g auth</c>) with a provider-backed flow:
/// <c>auth:otp</c> (phone code over SMS), <c>auth:oauth</c> (Google sign-in), or <c>auth:email</c> (email
/// verification + password reset). It emits the flow's slices, tests, and entities, then best-effort
/// edits the existing <c>User</c>, <c>AppDb</c>, <c>AccountModule</c>, <c>AccountSetup</c>, and the API
/// csproj to wire them in. Every edit is idempotent — re-running a flow never duplicates a field, DbSet,
/// map line, DI registration, or package reference — and a missing anchor prints a precise manual-step
/// note rather than failing the whole generator. The provider DI lands in <c>AccountSetup.AddAccount</c>
/// (the module's composition), never in <c>Program.cs</c> — the composition root stays a thin index (SKY0017).
/// </summary>
/// <remarks>
/// Targets the default multi-tenant scaffold only. An app generated with <c>--skip-tenancy</c> is rejected
/// with a clear message; the single-tenant augment is a later addition.
/// </remarks>
public static class AuthFlowGenerator
{
    /// <summary>Augment the Account module under <paramref name="root"/> with <paramref name="flow"/>.</summary>
    /// <param name="root">The application project directory (the one holding <c>&lt;App&gt;.Api.csproj</c>).</param>
    public static int Generate(string root, AuthFlow flow)
    {
        var csproj = Directory.GetFiles(root, "*.csproj").FirstOrDefault();
        if (csproj is null)
        {
            Console.Error.WriteLine("skies: no .csproj here — run this from the application project directory.");
            return 1;
        }

        var appNamespace = Path.GetFileNameWithoutExtension(csproj);            // e.g. Acme.Api
        var appName = appNamespace.EndsWith(".Api", StringComparison.Ordinal)
            ? appNamespace[..^4]
            : appNamespace;                                                     // e.g. Acme
        var appLower = appName.ToLowerInvariant();

        var accountModule = Path.Combine(root, "Modules", "Account", "AccountModule.cs");
        if (!File.Exists(accountModule))
        {
            Console.Error.WriteLine("skies: no Account module here — run `skies g auth` first.");
            return 1;
        }

        var userFile = Path.Combine(root, "Modules", "Account", "User.cs");
        if (File.Exists(userFile) && !File.ReadAllText(userFile).Contains("ITenantScoped"))
        {
            Console.Error.WriteLine($"skies: auth:{Token(flow)} currently supports the default (multi-tenant) "
                + "scaffold; this app was generated with --skip-tenancy.");
            return 1;
        }

        var spec = Spec(flow);

        EmitTemplates(spec, root, appName, appLower);
        DeclareCriteria(root, spec);
        AugmentErrorCodes(root, appNamespace, spec);
        AugmentUser(userFile, spec);
        AugmentAppDb(Path.Combine(root, "AppDb.cs"), spec);
        AugmentAccountModule(accountModule, spec);
        AugmentAccountSetup(Path.Combine(root, "Modules", "Account", "AccountSetup.cs"), spec);
        AugmentApiProject(csproj, spec);

        Console.WriteLine(spec.Summary);
        return 0;
    }

    // Emit each flow template into the API tree (slices + tests + entities all live under the API project;
    // co-located *.Tests.cs are compiled by the test project via its existing glob). Sessions.cs is skipped
    // when the scaffold already has it, so re-running (or a second flow) never clobbers it.
    private static void EmitTemplates(FlowSpec spec, string root, string appName, string appLower)
    {
        foreach (var logical in FlowTemplates.All(spec.Folder))
        {
            var relative = FlowTemplates.RenderPath(logical, appName, appLower);
            var destination = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));

            if (File.Exists(destination))
            {
                Console.WriteLine($"skipped {destination} (already present)");
                continue;
            }

            var body = FlowTemplates.Render(FlowTemplates.Read(spec.Folder, logical), appName, appLower);
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            File.WriteAllText(destination, body);
            Console.WriteLine($"created {destination}");
        }
    }

    // The flow is born with a reviewable acceptance obligation for every emitted slice. Its real co-located
    // test carries the matching subject-bound AVP marker, so adding an auth capability can never silently
    // widen production without widening the verification matrix.
    private static void DeclareCriteria(string root, FlowSpec spec)
    {
        var accountDir = Path.Combine(root, "Modules", "Account");
        foreach (var (slice, criterion) in spec.Criteria)
            SpecManifestScaffold.EnsureDeclared(accountDir, "Account", slice, [criterion]);
    }

    // Append the flow's error codes to the Account module's registry (AccountErrorCodes), idempotently — the
    // flow's slice templates reference these constants (SKY0018), and the base codes were placed by `g auth`.
    private static void AugmentErrorCodes(string root, string appNamespace, FlowSpec spec)
    {
        var accountDir = Path.Combine(root, "Modules", "Account");
        foreach (var (constName, value, summary) in spec.ErrorCodes)
            ErrorCodeScaffold.EnsureModuleCode(accountDir, appNamespace, "Account", constName, value, summary);
    }

    // Add the flow's user fields and mutators, idempotently. The User entity is a reshaped [Entity]
    // (SKY0014/SKY0021): its state is private, so a flow grows it through intention-revealing members, never
    // public setters a slice could reach. Fields sit with the other columns (after CreatedAt); mutators and
    // factories sit with the other methods (before the EnsureValid funnel). Each member is detected by a
    // stable token so re-running a flow — or applying a second flow that shares a member (email + oauth both
    // bring IsEmailVerified) — never duplicates it.
    private static void AugmentUser(string userFile, FlowSpec spec)
    {
        if (spec.UserFields.Count == 0 && spec.UserMethods.Count == 0)
            return;
        if (!File.Exists(userFile))
        {
            foreach (var f in spec.UserFields)
                Console.WriteLine($"note: add `{f.Trim()}` to Modules/Account/User.cs");
            foreach (var m in spec.UserMethods)
                Console.WriteLine($"note: add this member to Modules/Account/User.cs:{Environment.NewLine}{m.Code}");
            return;
        }

        var text = File.ReadAllText(userFile);
        var nl = Newline(text);
        var changed = false;

        var missingFields = spec.UserFields.Where(f => !ContainsMember(text, f)).ToList();
        if (missingFields.Count > 0)
        {
            var block = string.Join(nl + nl, missingFields.Select(f => f.Replace("\n", nl)));
            const string anchor = "    public DateTime CreatedAt { get; private set; }";
            if (text.Contains(anchor))
            {
                text = ReplaceFirst(text, anchor, anchor + nl + nl + block);
                changed = true;
            }
            else
            {
                foreach (var f in missingFields)
                    Console.WriteLine($"note: add `{f.Trim()}` to {userFile}");
            }
        }

        var missingMethods = spec.UserMethods.Where(m => !text.Contains(m.Token)).ToList();
        if (missingMethods.Count > 0)
        {
            var block = string.Join(nl + nl, missingMethods.Select(m => m.Code.Replace("\n", nl)));
            const string anchor = "    private Result<User> EnsureValid()";
            if (text.Contains(anchor))
            {
                text = ReplaceFirst(text, anchor, block + nl + nl + anchor);
                changed = true;
            }
            else
            {
                foreach (var m in missingMethods)
                    Console.WriteLine($"note: add this member to {userFile}:{Environment.NewLine}{m.Code}");
            }
        }

        if (changed)
        {
            File.WriteAllText(userFile, text);
            Console.WriteLine($"augmented User.cs ({missingFields.Count} field(s), {missingMethods.Count} method(s))");
        }
    }

    // Add the flow's DbSet properties and their indexes to the shared AppDb, idempotently. DbSets anchor
    // after the existing UserSessions DbSet; indexes anchor after the UserSession index block (FamilyId line).
    private static void AugmentAppDb(string dbFile, FlowSpec spec)
    {
        if (!File.Exists(dbFile))
        {
            Console.WriteLine("note: no AppDb.cs — add the flow's DbSet(s) and index(es) by hand.");
            return;
        }

        var text = File.ReadAllText(dbFile);
        var nl = Newline(text);
        var changed = false;

        foreach (var (property, declaration) in spec.DbSets)
        {
            if (text.Contains($"DbSet<{property}>"))
                continue;
            var anchor = "    public DbSet<UserSession> UserSessions => Set<UserSession>();";
            if (text.Contains(anchor))
            {
                text = ReplaceFirst(text, anchor, anchor + nl + nl + declaration);
                changed = true;
            }
            else
            {
                Console.WriteLine($"note: add `{declaration.Trim()}` to AppDb.cs");
            }
        }

        foreach (var index in spec.Indexes)
        {
            if (text.Contains(index.Trim()))
                continue;
            var anchor = "        session.HasIndex(s => s.FamilyId);";
            if (text.Contains(anchor))
            {
                text = ReplaceFirst(text, anchor, anchor + nl + nl + index);
                changed = true;
            }
            else
            {
                Console.WriteLine($"note: add `{index.Trim()}` to AppDb.cs OnModelCreating");
            }
        }

        if (changed)
        {
            File.WriteAllText(dbFile, text);
            Console.WriteLine("wired DbSet(s) + index(es) into AppDb.cs");
        }
    }

    // Add the flow's slice Map(account) lines to AccountModule, idempotently, before the closing brace of
    // the Map method (anchored on its "    }" that follows the existing maps).
    private static void AugmentAccountModule(string moduleFile, FlowSpec spec)
    {
        var text = File.ReadAllText(moduleFile);
        var nl = Newline(text);
        var missing = spec.MapLines.Where(m => !text.Contains(m.Trim())).ToList();
        if (missing.Count == 0)
            return;

        var block = string.Join(nl, missing);
        // The Map method body closes with a line that is exactly four spaces + "}" (the method), inside the
        // class. Insert before the last "Map(account);" line's following brace by anchoring on that brace.
        var anchor = nl + "    }" + nl + "}";
        if (text.Contains(anchor))
        {
            text = ReplaceFirst(text, anchor, nl + block + anchor);
            File.WriteAllText(moduleFile, text);
            Console.WriteLine($"wired {missing.Count} slice map(s) into AccountModule.cs");
        }
        else
        {
            foreach (var m in missing)
                Console.WriteLine($"note: add `{m.Trim()}` to AccountModule.Map");
        }
    }

    // Register the flow's provider DI in the Account module's composition (AccountSetup.AddAccount),
    // idempotently — NOT in Program.cs, which must stay a thin index (SKY0017 flags a registration that
    // leaks into the composition root). Adds the provider package's using too. Anchored on the
    // AddAuthorization() call that closes AddAccount's registrations.
    private static void AugmentAccountSetup(string accountSetup, FlowSpec spec)
    {
        if (!File.Exists(accountSetup))
        {
            Console.WriteLine($"note: no AccountSetup.cs — register `{spec.DiLine.Trim()}` in AddAccount.");
            return;
        }

        var text = File.ReadAllText(accountSetup);
        var nl = Newline(text);
        var changed = false;

        var usingLine = $"using {spec.ProviderNamespace};";
        if (!text.Contains(usingLine))
        {
            // Group it with the existing usings, right after the framework's Skies.Framework.Auth import.
            text = ReplaceFirst(text, "using Skies.Framework.Auth;", "using Skies.Framework.Auth;" + nl + usingLine);
            changed = true;
        }

        if (!text.Contains(spec.DiLine.Trim()))
        {
            // AddAccount's last registration — the provider joins the module's services beside it.
            var anchor = "        builder.Services.AddAuthorization();";
            if (text.Contains(anchor))
            {
                text = ReplaceFirst(text, anchor, anchor + nl + "        " + spec.DiLine.Trim());
                changed = true;
            }
            else
            {
                Console.WriteLine($"note: add `{spec.DiLine.Trim()}` to AddAccount in AccountSetup.cs");
            }
        }

        if (changed)
        {
            File.WriteAllText(accountSetup, text);
            Console.WriteLine($"registered {spec.ProviderNamespace} provider in AccountSetup.cs");
        }
    }

    // Add the flow's framework reference to the API csproj, idempotently. Matches the existing Skies.Framework.*
    // reference style: ProjectReference in co-dev (when Skies.Framework.AspNetCore is a ProjectReference), else a
    // PackageReference at the framework release emitted by the current CLI.
    private static void AugmentApiProject(string csproj, FlowSpec spec)
    {
        var text = File.ReadAllText(csproj);
        if (text.Contains(spec.PackageId))
            return;

        var nl = Newline(text);
        string reference;
        var aspNetProjectRef = FindProjectReference(text, "Skies.Framework.AspNetCore");
        if (aspNetProjectRef is not null)
        {
            var relativeDir = Path.GetDirectoryName(aspNetProjectRef.Replace('/', Path.DirectorySeparatorChar))!;
            var siblingDir = Path.Combine(Path.GetDirectoryName(relativeDir) ?? "", spec.PackageId);
            var projPath = Path.Combine(siblingDir, spec.PackageId + ".csproj").Replace('/', '\\');
            reference = $"    <ProjectReference Include=\"{projPath}\" />";
        }
        else
        {
            reference =
                $"    <PackageReference Include=\"{spec.PackageId}\" Version=\"{FrameworkPackageVersions.Framework}\" />";
        }

        text = InsertBeforeClosingItemGroup(text, reference, nl);
        File.WriteAllText(csproj, text);
        Console.WriteLine($"added {spec.PackageId} reference to {Path.GetFileName(csproj)}");
    }

    // ---- helpers ----------------------------------------------------------------------------------

    private static string Token(AuthFlow flow) => flow switch
    {
        AuthFlow.Otp => "otp",
        AuthFlow.OAuth => "oauth",
        AuthFlow.Email => "email",
        _ => throw new ArgumentOutOfRangeException(nameof(flow)),
    };

    // A field is "present" if its property name already appears as a member declaration. The field string
    // is e.g. "    public bool IsEmailVerified { get; set; }"; we test on the "Name {" shape so a differing
    // type or default does not cause a duplicate.
    private static bool ContainsMember(string text, string fieldLine)
    {
        var name = MemberName(fieldLine);
        return name is not null && text.Contains($"{name} {{");
    }

    private static string? MemberName(string fieldLine)
    {
        var braceAt = fieldLine.IndexOf('{');
        if (braceAt <= 0)
            return null;
        var beforeBrace = fieldLine[..braceAt].TrimEnd();
        var lastSpace = beforeBrace.LastIndexOf(' ');
        return lastSpace < 0 ? null : beforeBrace[(lastSpace + 1)..];
    }

    // A multi-line injected member, written with \n joins for readability; AugmentUser normalizes the
    // newlines to the target file's on application.
    private static string Lines(params string[] lines) => string.Join("\n", lines);

    private static string? FindProjectReference(string csproj, string projectName)
    {
        foreach (var raw in csproj.Replace("\r\n", "\n").Split('\n'))
        {
            var line = raw.Trim();
            if (!line.StartsWith("<ProjectReference", StringComparison.Ordinal) || !line.Contains(projectName + ".csproj"))
                continue;
            const string key = "Include=\"";
            var start = line.IndexOf(key, StringComparison.Ordinal);
            if (start < 0)
                continue;
            start += key.Length;
            var end = line.IndexOf('"', start);
            if (end < 0)
                continue;
            return line[start..end];
        }
        return null;
    }

    private static string ReplaceFirst(string text, string find, string replacement)
    {
        var at = text.IndexOf(find, StringComparison.Ordinal);
        return at < 0 ? text : text[..at] + replacement + text[(at + find.Length)..];
    }

    private static string InsertBeforeClosingItemGroup(string text, string lines, string nl)
    {
        var at = text.IndexOf("</ItemGroup>", StringComparison.Ordinal);
        if (at < 0)
            return text;
        var lineStart = text.LastIndexOf('\n', at) + 1;
        return text[..lineStart] + lines + nl + text[lineStart..];
    }

    private static string Newline(string text) => text.Contains("\r\n") ? "\r\n" : "\n";

    // ---- flow specs -------------------------------------------------------------------------------

    private sealed record FlowSpec(
        string Folder,
        string PackageId,
        string ProviderNamespace,
        string DiLine,
        IReadOnlyList<string> UserFields,
        IReadOnlyList<(string Token, string Code)> UserMethods,
        IReadOnlyList<(string Property, string Declaration)> DbSets,
        IReadOnlyList<string> Indexes,
        IReadOnlyList<string> MapLines,
        IReadOnlyList<(string Slice, string Criterion)> Criteria,
        IReadOnlyList<(string Const, string Value, string Summary)> ErrorCodes,
        string Summary);

    private static FlowSpec Spec(AuthFlow flow) => flow switch
    {
        AuthFlow.Otp => new FlowSpec(
            Folder: "auth-otp",
            PackageId: "Skies.Framework.Sms",
            ProviderNamespace: "Skies.Framework.Sms",
            DiLine: "builder.Services.AddSingleton<ISmsSender, ConsoleSmsSender>();",
            UserFields:
            [
                Lines(
                    "    /// <summary>The verified phone number, set once VerifyPhone succeeds.</summary>",
                    "    public string? Phone { get; private set; }"),
                Lines(
                    "    /// <summary>Whether the phone number has been verified.</summary>",
                    "    public bool IsPhoneVerified { get; private set; }"),
            ],
            UserMethods:
            [
                (Token: "CompletePhoneVerification(", Code: Lines(
                    "    /// <summary>Complete phone verification: record the verified phone, flag it verified, and",
                    "    /// advance registration to Complete. Cannot fail — a void mutation.</summary>",
                    "    public void CompletePhoneVerification(string phone)",
                    "    {",
                    "        Phone = phone;",
                    "        IsPhoneVerified = true;",
                    "        RegistrationStep = RegistrationStep.Complete;",
                    "    }")),
            ],
            DbSets:
            [
                ("PhoneOtp", "    public DbSet<PhoneOtp> PhoneOtps => Set<PhoneOtp>();"),
            ],
            Indexes:
            [
                "        model.Entity<PhoneOtp>().HasIndex(o => o.UserId);",
            ],
            MapLines:
            [
                "        ResendPhoneCode.Map(account);",
                "        VerifyPhone.Map(account);",
            ],
            Criteria:
            [
                ("ResendPhoneCode", "issues-single-active-code"),
                ("VerifyPhone", "accepts-valid-code"),
            ],
            ErrorCodes:
            [
                ("NoActiveCode", "auth.no_active_code", "The phone has no active OTP code."),
                ("InvalidCode", "auth.invalid_code", "The submitted OTP code is wrong."),
                ("TooManyAttempts", "auth.too_many_attempts", "The OTP code was guessed wrong too many times and is now locked."),
            ],
            Summary: "auth:otp generated — phone verification by SMS code (ConsoleSmsSender in dev). "
                + "Complete the generated proofs, then run `skies gate`."),

        AuthFlow.OAuth => new FlowSpec(
            Folder: "auth-oauth",
            PackageId: "Skies.Framework.Identity",
            ProviderNamespace: "Skies.Framework.Identity",
            DiLine: "builder.Services.AddSingleton<IExternalIdentity, FakeExternalIdentity>();",
            UserFields:
            [
                Lines(
                    "    /// <summary>Whether the account's email has been verified.</summary>",
                    "    public bool IsEmailVerified { get; private set; }"),
            ],
            UserMethods:
            [
                (Token: "RegisterViaGoogle(", Code: Lines(
                    "    /// <summary>Register an account from a Google identity: Google has already verified the email,",
                    "    /// so the user is email-verified from the start, has no password (a random one is stored —",
                    "    /// Google is the credential), and lands at PhonePending. Funnels through EnsureValid.</summary>",
                    "    public static Result<User> RegisterViaGoogle(Email email, DateTime now) =>",
                    "        new User",
                    "        {",
                    "            Id = Guid.NewGuid(),",
                    "            Email = email,",
                    "            Name = email.Value,",
                    "            PasswordHash = PasswordHash.Create(Guid.NewGuid().ToString()),",
                    "            IsEmailVerified = true,",
                    "            RegistrationStep = RegistrationStep.PhonePending,",
                    "            CreatedAt = now,",
                    "        }.EnsureValid();")),
            ],
            DbSets: [],
            Indexes: [],
            MapLines:
            [
                "        RegisterWithGoogle.Map(account);",
                "        LoginWithGoogle.Map(account);",
            ],
            Criteria:
            [
                ("RegisterWithGoogle", "registers-verified-external-identity"),
                ("LoginWithGoogle", "issues-token-on-valid"),
            ],
            ErrorCodes:
            [
                ("InvalidToken", "auth.invalid_token", "The external identity token is invalid."),
                ("NoAccount", "auth.no_account", "No account exists for this external identity."),
            ],
            Summary: "auth:oauth generated — Google sign-up/sign-in (FakeExternalIdentity in dev). "
                + "Complete the generated proofs, then run `skies gate`."),

        AuthFlow.Email => new FlowSpec(
            Folder: "auth-email",
            PackageId: "Skies.Framework.Mail",
            ProviderNamespace: "Skies.Framework.Mail",
            DiLine: "builder.Services.AddSingleton<IEmailSender, ConsoleEmailSender>();",
            UserFields:
            [
                Lines(
                    "    /// <summary>Whether the account's email has been verified.</summary>",
                    "    public bool IsEmailVerified { get; private set; }"),
            ],
            UserMethods:
            [
                (Token: "MarkEmailVerified(", Code: Lines(
                    "    /// <summary>Flag the account's email verified. Cannot fail — a void mutation.</summary>",
                    "    public void MarkEmailVerified() => IsEmailVerified = true;")),
            ],
            DbSets:
            [
                ("EmailVerificationToken", "    public DbSet<EmailVerificationToken> EmailVerificationTokens => Set<EmailVerificationToken>();"),
                ("PasswordResetToken", "    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();"),
            ],
            Indexes:
            [
                "        model.Entity<EmailVerificationToken>().HasIndex(t => t.TokenHash);",
                "        model.Entity<PasswordResetToken>().HasIndex(t => t.TokenHash);",
            ],
            MapLines:
            [
                "        RequestEmailVerification.Map(account);",
                "        VerifyEmail.Map(account);",
                "        RequestPasswordReset.Map(account);",
                "        ResetPassword.Map(account);",
            ],
            Criteria:
            [
                ("RequestEmailVerification", "issues-single-active-token"),
                ("VerifyEmail", "accepts-valid-token"),
                ("RequestPasswordReset", "does-not-reveal-account-existence"),
                ("ResetPassword", "invalidates-used-token"),
            ],
            ErrorCodes:
            [
                ("InvalidToken", "auth.invalid_token", "The verification token is invalid or expired."),
                ("ResetTokenInvalid", "auth.invalid_reset_token", "The password-reset token is invalid or expired."),
            ],
            Summary: "auth:email generated — email verification + password reset by emailed token "
                + "(ConsoleEmailSender in dev). Complete the generated proofs, then run `skies gate`."),

        _ => throw new ArgumentOutOfRangeException(nameof(flow)),
    };
}
