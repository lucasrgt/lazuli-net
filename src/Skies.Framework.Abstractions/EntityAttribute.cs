namespace Skies.Framework.Abstractions;

/// <summary>
/// Marks a class as a domain entity — a thing with identity and a lifecycle that owns and
/// guards its own invariants (a <c>Wallet</c>, an <c>Order</c>). The marker pins the entity to
/// the always-valid discipline the doctor (<c>SKY0014</c>) enforces: it exposes no public
/// constructor (it is born through a static factory like <c>Open</c> and rehydrated by EF
/// through a private one), no public property setter (state changes only through
/// intention-revealing methods), and a single private invariant funnel —
/// <c>EnsureValid()</c> returning a <see cref="Result{T}"/> — that every creating and mutating
/// path converges on, so the entity can never be observed or persisted in a broken state.
///
/// It carries <strong>no EF semantics</strong> — EF Core never inspects it; mapping stays the
/// job of the <c>DbContext</c>. Like <see cref="SliceAttribute"/> it is a pure marker with
/// nothing to inherit: remove the <c>Skies.Framework.Doctor</c> analyzer and it becomes inert decoration,
/// the entity compiling and running unchanged (Law 2). The required private parameterless
/// constructor is exactly the one EF wants for materialisation, so the convention and the ORM
/// ask for the same thing.
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class EntityAttribute : Attribute;
