namespace Skies.Framework.Abstractions;

/// <summary>
/// Marks a type as a value object — an immutable, identity-less domain value whose type
/// <em>is</em> its rule (<c>Money</c>, <c>Cpf</c>, <c>Email</c>). The point is that an instance
/// cannot exist in an invalid state: there is no public constructor, so the only way in is a
/// static smart constructor returning a <see cref="Result{T}"/> (the <c>Money.From</c> shape),
/// and the value is read-only once built. A <c>Validate</c> step "afterwards" is then impossible
/// to forget — there is nothing to validate, because an invalid value never came to be.
///
/// Like <see cref="SliceAttribute"/> it is a <strong>pure marker</strong>: no base class, no
/// behaviour, nothing to inherit. Delete the <c>Skies.Framework.Doctor</c> analyzer and this attribute
/// becomes inert decoration — the type still compiles and runs (Law 2). Its only job is to give
/// the doctor (<c>SKY0013</c>) a reliable anchor for the always-valid contract above.
/// </summary>
[AttributeUsage(AttributeTargets.Struct | AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class ValueObjectAttribute : Attribute;
