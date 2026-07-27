// The web UI kit template — the closed-API primitives DESIGN-CONVENTIONS.md locks (the `@/ui` door).
// Emitted by `design-scaffold.mjs --kit web` as code the app OWNS; the canonical instance lives at
// examples/sample-app/frontend/web/src/ui and the drift test pins this template to it byte-for-byte —
// template and exemplar are the same artifact by force. Extend the kit in YOUR ui/ (new primitives,
// your styling mechanism); the API contract is the convention, the implementation is yours.

/** Render the web kit — returns { filename: contents } for the app's ui/ folder. */
export function renderUiKitWeb() {
  return {
    "tokens-bridge.ts": `// The kit's single import seam to the app's tokens. If your tokens live elsewhere, repoint THIS file —
// every primitive imports from here, never from the tokens path directly.
export * from "@/design/tokens";
`,
    "Screen.tsx": `import type { ReactNode } from "react";
import { color, space } from "./tokens-bridge";

// Page container — owns the page background and the readable content column, so screens never
// hand-roll page margins (DESIGN-CONVENTIONS.md §Layout). The closed API starts here: no className,
// no style — a screen that needs different paint needs a different primitive, in ui/.
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div data-ui="screen" style={{ minHeight: "100%", backgroundColor: color.bg, padding: space.lg }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>{children}</div>
    </div>
  );
}
`,
    "Stack.tsx": `import type { ReactNode } from "react";
import { space, type SpaceToken } from "./tokens-bridge";

const ALIGN = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;

// Layout rhythm lives HERE: gap comes from the spacing scale, children never carry margins
// (DESIGN-CONVENTIONS.md §Layout — vertical rhythm belongs to the container).
export function Stack({
  children,
  gap = "md",
  direction = "vertical",
  align,
  padding,
}: {
  children: ReactNode;
  gap?: SpaceToken;
  direction?: "vertical" | "horizontal";
  align?: "start" | "center" | "end" | "stretch";
  padding?: SpaceToken;
}) {
  return (
    <div
      data-ui="stack"
      style={{
        display: "flex",
        flexDirection: direction === "vertical" ? "column" : "row",
        gap: space[gap],
        alignItems: align ? ALIGN[align] : undefined,
        padding: padding ? space[padding] : undefined,
      }}
    >
      {children}
    </div>
  );
}
`,
    "Text.tsx": `import type { ReactNode } from "react";
import { color, text, type TextRole } from "./tokens-bridge";

// A role maps to the document outline (one title per screen — DESIGN-CONVENTIONS.md §Text hierarchy);
// size + line-height + weight travel together so typography is one decision, not three.
const TAG: Record<TextRole, "h1" | "h2" | "p" | "span"> = {
  display: "h1",
  title: "h1",
  heading: "h2",
  body: "p",
  label: "span",
  caption: "span",
};

export function Text({
  children,
  role = "body",
  tone = "default",
  alert = false,
}: {
  children: ReactNode;
  role?: TextRole;
  tone?: "default" | "muted" | "danger" | "inverse";
  // Announces the text to assistive tech (role="alert") — the command-error surface a form renders
  // above its submit (DESIGN-CONVENTIONS.md §Form anatomy).
  alert?: boolean;
}) {
  const Tag = TAG[role];
  const t = text[role];
  const TONE = { default: color.text, muted: color.textMuted, danger: color.danger, inverse: color.textInverse };
  return (
    <Tag
      data-ui="text"
      data-role={role}
      role={alert ? "alert" : undefined}
      style={{
        // Margins belong to the container (Stack gap), so the element defaults are zeroed.
        margin: 0,
        fontSize: t.fontSize,
        lineHeight: t.lineHeight + "px",
        fontWeight: t.fontWeight,
        color: TONE[tone],
      }}
    >
      {children}
    </Tag>
  );
}
`,
    "Button.tsx": `'use client';

// Stateful kit primitive → a client component: the Next App Router needs the directive; a no-op on Vite/RN.
import { useState } from "react";
import { color, motionMs, radius, space, text } from "./tokens-bridge";

type Variant = "primary" | "secondary" | "danger";

// Every variant carries its full state set; a consumer can't forget a state because it never
// implements one (DESIGN-CONVENTIONS.md §The five interactive states).
const FILL: Record<Variant, { rest: string; hover: string; active: string; on: string }> = {
  primary: { rest: color.primary, hover: color.primaryHover, active: color.primaryActive, on: color.onPrimary },
  secondary: { rest: color.surface, hover: color.bg, active: color.border, on: color.text },
  danger: { rest: color.danger, hover: color.dangerHover, active: color.dangerHover, on: color.onDanger },
};

// A button is a labeled action — \`label\` is a string by contract, so the accessible name is the
// visible name. \`loading\` blocks and announces; the focus ring is the replacement for the outline
// it suppresses (never removed without one).
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const [focused, setFocused] = useState(false);
  const blocked = disabled || loading;
  const fill = FILL[variant];
  const background = blocked ? color.border : active ? fill.active : hover ? fill.hover : fill.rest;

  return (
    <button
      type="button"
      data-ui="button"
      data-variant={variant}
      disabled={blocked}
      aria-busy={loading || undefined}
      onClick={onPress}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight: 44,
        paddingLeft: space.lg,
        paddingRight: space.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: variant === "secondary" ? color.borderStrong : "transparent",
        backgroundColor: background,
        color: blocked ? color.textMuted : fill.on,
        fontSize: text.label.fontSize,
        lineHeight: text.label.lineHeight + "px",
        fontWeight: text.label.fontWeight,
        cursor: blocked ? "not-allowed" : "pointer",
        transition: "background-color " + motionMs.fast + "ms ease",
        outline: "none",
        boxShadow: focused ? "0 0 0 2px " + color.focusRing : "none",
      }}
    >
      {label}
    </button>
  );
}
`,
    "Field.tsx": `'use client';

// Stateful kit primitive → a client component: the Next App Router needs the directive; a no-op on Vite/RN.
import { createContext, useContext, type ReactNode } from "react";
import { color, space, text } from "./tokens-bridge";

// Field → control wiring travels through kit-internal context, so the anatomy (label → control →
// hint|error) and the aria plumbing are one decision made here, never re-made per screen
// (DESIGN-CONVENTIONS.md §Form anatomy).
interface FieldWiring {
  describedBy?: string;
  invalid?: boolean;
}
const FieldContext = createContext<FieldWiring>({});

/** Kit-internal: the control (Input) reads its aria wiring from the enclosing Field. */
export function useFieldWiring(): FieldWiring {
  return useContext(FieldContext);
}

export function Field({
  fieldId,
  label,
  hint,
  error,
  children,
}: {
  fieldId: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const messageId = error ? fieldId + "-error" : hint ? fieldId + "-hint" : undefined;
  const message = {
    fontSize: text.caption.fontSize,
    lineHeight: text.caption.lineHeight + "px",
    fontWeight: text.caption.fontWeight,
  };

  return (
    <div data-ui="field" style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <label
        htmlFor={fieldId}
        style={{
          fontSize: text.label.fontSize,
          lineHeight: text.label.lineHeight + "px",
          fontWeight: text.label.fontWeight,
          color: color.text,
        }}
      >
        {label}
      </label>
      <FieldContext.Provider value={{ describedBy: messageId, invalid: Boolean(error) }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <span id={fieldId + "-error"} role="alert" style={{ ...message, color: color.danger }}>
          {error}
        </span>
      ) : hint ? (
        <span id={fieldId + "-hint"} style={{ ...message, color: color.textMuted }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
`,
    "Input.tsx": `'use client';

// Stateful kit primitive → a client component: the Next App Router needs the directive; a no-op on Vite/RN.
import { useState } from "react";
import { color, radius, space, text } from "./tokens-bridge";
import { useFieldWiring } from "./Field";

// String-first and platform-neutral: \`onChangeText\` hands the View a value, not an event, so the
// same ViewModel binding works against the RN mirror. The enclosing Field supplies the aria wiring;
// an explicit \`invalid\` prop wins over it.
export function Input({
  id,
  value,
  onChangeText,
  placeholder,
  kind = "text",
  invalid,
}: {
  id: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  kind?: "text" | "email" | "password" | "number";
  invalid?: boolean;
}) {
  const wiring = useFieldWiring();
  const [focused, setFocused] = useState(false);
  const isInvalid = invalid ?? wiring.invalid ?? false;

  return (
    <input
      id={id}
      data-ui="input"
      type={kind === "number" ? "text" : kind}
      inputMode={kind === "number" ? "numeric" : kind === "email" ? "email" : undefined}
      value={value}
      onChange={(e) => onChangeText(e.currentTarget.value)}
      placeholder={placeholder}
      aria-invalid={isInvalid || undefined}
      aria-describedby={wiring.describedBy}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight: 44,
        paddingLeft: space.md,
        paddingRight: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: isInvalid ? color.danger : color.borderStrong,
        backgroundColor: color.surface,
        color: color.text,
        fontSize: text.body.fontSize,
        lineHeight: text.body.lineHeight + "px",
        outline: "none",
        boxShadow: focused ? "0 0 0 2px " + color.focusRing : "none",
      }}
    />
  );
}
`,
    "Card.tsx": `import type { ReactNode } from "react";
import { color, radius, shadow, space, type SpaceToken } from "./tokens-bridge";

// The raised surface — elevation is a token (\`shadow.raised\`), never a per-card invention.
export function Card({
  children,
  padding = "lg",
  listItem = false,
}: {
  children: ReactNode;
  padding?: SpaceToken;
  /** Maps the collection-row semantic to the platform accessibility tree. */
  listItem?: boolean;
}) {
  return (
    <div
      data-ui="card"
      role={listItem ? "listitem" : undefined}
      style={{
        backgroundColor: color.surface,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: color.border,
        borderRadius: radius.lg,
        boxShadow: shadow.raised,
        padding: space[padding],
      }}
    >
      {children}
    </div>
  );
}
`,
    "states.tsx": `import { Button } from "./Button";
import { Stack } from "./Stack";
import { Text } from "./Text";

// The async sad/empty paths <Resource> renders — kit-composed (the kit dogfoods its own
// vocabulary), so every screen's empty and error read the same.
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <Stack gap="xs" align="center" padding="xl">
      <Text role="heading">{title}</Text>
      {description ? <Text tone="muted">{description}</Text> : null}
    </Stack>
  );
}

export function ErrorState({
  title,
  retryLabel,
  onRetry,
}: {
  title: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <Stack gap="sm" align="center" padding="xl">
      <Text role="heading" tone="danger">
        {title}
      </Text>
      {onRetry && retryLabel ? <Button label={retryLabel} onPress={onRetry} variant="secondary" /> : null}
    </Stack>
  );
}
`,
    "index.ts": `// The app's design system — the one paint door (SKYFE024). The API is closed by construction: props
// are token unions (DESIGN-CONVENTIONS.md), no className/style passthrough anywhere. A missing
// primitive is added HERE, following the constitution — never inlined in a screen.
export { Screen } from "./Screen";
export { Stack } from "./Stack";
export { Text } from "./Text";
export { Button } from "./Button";
export { Field } from "./Field";
export { Input } from "./Input";
export { Card } from "./Card";
export { EmptyState, ErrorState } from "./states";
`,
  };
}
