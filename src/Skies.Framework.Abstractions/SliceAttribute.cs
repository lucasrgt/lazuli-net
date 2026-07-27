namespace Skies.Framework.Abstractions;

/// <summary>
/// Marks a class as a vertical slice — one feature, one file. The module a slice
/// belongs to is <em>derived</em> from its namespace/folder, never declared here, so
/// this stays a pure marker: it gives the doctor and the knowledge-graph extractor a
/// reliable anchor without adding a decision the author (human or LLM) has to make.
///
/// A conformant slice is a <c>static</c> class carrying this attribute, with nested
/// <c>Input</c> and <c>Output</c> types, a public <c>Handle</c> method returning a
/// <c>Task</c> of <see cref="Result{T}"/>, and a <c>Map</c> — declared in that order.
/// The <c>Skies.Framework.Doctor</c> analyzer enforces that shape.
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class SliceAttribute : Attribute;
