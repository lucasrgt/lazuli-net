#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Render the app-owned Flutter token vocabulary and closed UI kit. */
export function renderDesignKit() {
  return {
    "design/tokens.dart": tokens(),
    "ui/app_screen.dart": screen(),
    "ui/app_stack.dart": stack(),
    "ui/app_text.dart": text(),
    "ui/app_button.dart": button(),
    "ui/app_field.dart": field(),
    "ui/app_input.dart": input(),
    "ui/app_card.dart": card(),
    "ui/app_states.dart": states(),
    "ui/app_list.dart": list(),
    "ui/ui.dart": barrel(),
  };
}

function tokens() {
  return `import 'package:flutter/material.dart';

enum SpaceToken { none, xs, sm, md, lg, xl, xxl }
enum RadiusToken { none, sm, md, lg, full }
enum TextRole { display, title, heading, body, label, caption }
enum ShadowToken { none, raised, overlay }
enum MotionToken { instant, fast, base, slow }
enum ColorRole {
  bg, surface, surfaceRaised, border, borderStrong,
  text, textMuted, textInverse, primary, primaryHover, primaryActive,
  onPrimary, danger, dangerHover, onDanger, dangerSurface,
  success, successSurface, warning, warningSurface, focusRing, scrim,
}

const space = <SpaceToken, double>{
  SpaceToken.none: 0, SpaceToken.xs: 4, SpaceToken.sm: 8,
  SpaceToken.md: 12, SpaceToken.lg: 16, SpaceToken.xl: 24, SpaceToken.xxl: 32,
};
const radius = <RadiusToken, double>{
  RadiusToken.none: 0, RadiusToken.sm: 4, RadiusToken.md: 8,
  RadiusToken.lg: 12, RadiusToken.full: 9999,
};
const motion = <MotionToken, Duration>{
  MotionToken.instant: Duration.zero,
  MotionToken.fast: Duration(milliseconds: 100),
  MotionToken.base: Duration(milliseconds: 200),
  MotionToken.slow: Duration(milliseconds: 300),
};
const shadow = <ShadowToken, List<BoxShadow>>{
  ShadowToken.none: <BoxShadow>[],
  ShadowToken.raised: <BoxShadow>[BoxShadow(color: Color(0x1a0f172a), blurRadius: 8, offset: Offset(0, 2))],
  ShadowToken.overlay: <BoxShadow>[BoxShadow(color: Color(0x330f172a), blurRadius: 24, offset: Offset(0, 8))],
};
const breakpoints = (compact: 0.0, regular: 768.0, wide: 1200.0);

const lightColors = <ColorRole, Color>{
  ColorRole.bg: Color(0xfff8fafc), ColorRole.surface: Color(0xffffffff),
  ColorRole.surfaceRaised: Color(0xffffffff), ColorRole.border: Color(0xffe2e8f0),
  ColorRole.borderStrong: Color(0xff94a3b8), ColorRole.text: Color(0xff0f172a),
  ColorRole.textMuted: Color(0xff64748b), ColorRole.textInverse: Color(0xffffffff),
  ColorRole.primary: Color(0xff2563eb), ColorRole.primaryHover: Color(0xff1d4ed8),
  ColorRole.primaryActive: Color(0xff1e40af), ColorRole.onPrimary: Color(0xffffffff),
  ColorRole.danger: Color(0xffb91c1c), ColorRole.dangerHover: Color(0xff991b1b),
  ColorRole.onDanger: Color(0xffffffff), ColorRole.dangerSurface: Color(0xfffef2f2),
  ColorRole.success: Color(0xff15803d), ColorRole.successSurface: Color(0xfff0fdf4),
  ColorRole.warning: Color(0xffa16207), ColorRole.warningSurface: Color(0xfffffbeb),
  ColorRole.focusRing: Color(0xff60a5fa), ColorRole.scrim: Color(0x99000000),
};
const darkColors = <ColorRole, Color>{
  ColorRole.bg: Color(0xff020617), ColorRole.surface: Color(0xff0f172a),
  ColorRole.surfaceRaised: Color(0xff1e293b), ColorRole.border: Color(0xff334155),
  ColorRole.borderStrong: Color(0xff64748b), ColorRole.text: Color(0xfff8fafc),
  ColorRole.textMuted: Color(0xff94a3b8), ColorRole.textInverse: Color(0xff0f172a),
  ColorRole.primary: Color(0xff60a5fa), ColorRole.primaryHover: Color(0xff93c5fd),
  ColorRole.primaryActive: Color(0xffbfdbfe), ColorRole.onPrimary: Color(0xff172554),
  ColorRole.danger: Color(0xfff87171), ColorRole.dangerHover: Color(0xfffca5a5),
  ColorRole.onDanger: Color(0xff450a0a), ColorRole.dangerSurface: Color(0xff450a0a),
  ColorRole.success: Color(0xff4ade80), ColorRole.successSurface: Color(0xff052e16),
  ColorRole.warning: Color(0xfffacc15), ColorRole.warningSurface: Color(0xff422006),
  ColorRole.focusRing: Color(0xff93c5fd), ColorRole.scrim: Color(0xb3000000),
};

Map<ColorRole, Color> colorsOf(BuildContext context) =>
    MediaQuery.platformBrightnessOf(context) == Brightness.dark ? darkColors : lightColors;

TextStyle textStyle(TextRole role, Color color) => switch (role) {
  TextRole.display => TextStyle(fontSize: 31, height: 40 / 31, fontWeight: FontWeight.w700, color: color),
  TextRole.title => TextStyle(fontSize: 25, height: 32 / 25, fontWeight: FontWeight.w700, color: color),
  TextRole.heading => TextStyle(fontSize: 20, height: 28 / 20, fontWeight: FontWeight.w600, color: color),
  TextRole.body => TextStyle(fontSize: 16, height: 24 / 16, fontWeight: FontWeight.w400, color: color),
  TextRole.label => TextStyle(fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w600, color: color),
  TextRole.caption => TextStyle(fontSize: 12, height: 16 / 12, fontWeight: FontWeight.w400, color: color),
};
`;
}

function screen() { return `import 'package:flutter/widgets.dart';
import '../design/tokens.dart';
final class AppScreen extends StatelessWidget {
  const AppScreen({required this.child, super.key});
  final Widget child;
  @override Widget build(BuildContext context) => ColoredBox(
    color: colorsOf(context)[ColorRole.bg]!,
    child: SafeArea(child: Padding(padding: EdgeInsets.all(space[SpaceToken.lg]!), child: child)),
  );
}
`; }

function stack() { return `import 'package:flutter/widgets.dart';
import '../design/tokens.dart';
enum StackDirection { vertical, horizontal }
enum StackAlign { start, center, end, stretch }
final class AppStack extends StatelessWidget {
  const AppStack({
    required this.children,
    this.gap = SpaceToken.md,
    this.direction = StackDirection.vertical,
    this.align = StackAlign.stretch,
    this.padding = SpaceToken.none,
    super.key,
  });
  final List<Widget> children;
  final SpaceToken gap;
  final StackDirection direction;
  final StackAlign align;
  final SpaceToken padding;
  @override Widget build(BuildContext context) {
    final separated = <Widget>[];
    for (var index = 0; index < children.length; index++) {
      if (index > 0) {
        separated.add(direction == StackDirection.vertical
            ? SizedBox(height: space[gap]!)
            : SizedBox(width: space[gap]!));
      }
      separated.add(children[index]);
    }
    final crossAxisAlignment = switch (align) {
      StackAlign.start => CrossAxisAlignment.start,
      StackAlign.center => CrossAxisAlignment.center,
      StackAlign.end => CrossAxisAlignment.end,
      StackAlign.stretch => CrossAxisAlignment.stretch,
    };
    final content = direction == StackDirection.vertical
        ? Column(crossAxisAlignment: crossAxisAlignment, children: separated)
        : Row(crossAxisAlignment: crossAxisAlignment, children: separated);
    return Padding(padding: EdgeInsets.all(space[padding]!), child: content);
  }
}
`; }

function text() { return `import 'package:flutter/widgets.dart';
import '../design/tokens.dart';
enum TextTone { normal, muted, danger, inverse }
final class AppText extends StatelessWidget {
  const AppText(this.value, {this.role = TextRole.body, this.tone = TextTone.normal, this.live = false, super.key});
  final String value;
  final TextRole role;
  final TextTone tone;
  final bool live;
  @override Widget build(BuildContext context) {
    final colors = colorsOf(context);
    final color = switch (tone) {
      TextTone.normal => colors[ColorRole.text]!, TextTone.muted => colors[ColorRole.textMuted]!,
      TextTone.danger => colors[ColorRole.danger]!, TextTone.inverse => colors[ColorRole.textInverse]!,
    };
    return Semantics(liveRegion: live, child: Text(value, style: textStyle(role, color)));
  }
}
`; }

function button() { return `import 'package:flutter/material.dart';
import '../design/tokens.dart';
enum AppButtonVariant { primary, secondary, danger }
final class AppButton extends StatelessWidget {
  const AppButton({
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.disabled = false,
    this.loading = false,
    super.key,
  });
  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool disabled;
  final bool loading;
  @override Widget build(BuildContext context) {
    final colors = colorsOf(context);
    final background = switch (variant) {
      AppButtonVariant.primary => colors[ColorRole.primary]!, AppButtonVariant.danger => colors[ColorRole.danger]!,
      AppButtonVariant.secondary => colors[ColorRole.surface]!,
    };
    final foreground = switch (variant) {
      AppButtonVariant.primary => colors[ColorRole.onPrimary]!,
      AppButtonVariant.danger => colors[ColorRole.onDanger]!,
      AppButtonVariant.secondary => colors[ColorRole.text]!,
    };
    return Semantics(
      button: true, label: label, liveRegion: loading,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 44),
        child: FilledButton(
          onPressed: loading || disabled ? null : onPressed,
          style: ButtonStyle(backgroundColor: WidgetStatePropertyAll(background), foregroundColor: WidgetStatePropertyAll(foreground)),
          child: loading ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator()) : Text(label),
        ),
      ),
    );
  }
}
`; }

function field() { return `import 'package:flutter/widgets.dart';
import '../design/tokens.dart';
import 'app_stack.dart';
import 'app_text.dart';
final class AppField extends StatelessWidget {
  const AppField({required this.label, required this.child, this.hint, this.error, super.key});
  final String label;
  final Widget child;
  final String? hint;
  final String? error;
  @override Widget build(BuildContext context) => MergeSemantics(
    child: Semantics(
      container: true,
      label: label,
      child: AppStack(children: [
        AppText(label, role: TextRole.label), child,
        if (error case final value?) AppText(value, role: TextRole.caption, tone: TextTone.danger, live: true)
        else if (hint case final value?) AppText(value, role: TextRole.caption, tone: TextTone.muted),
      ]),
    ),
  );
}
`; }

function input() { return `import 'package:flutter/material.dart';
enum AppInputKind { text, email, password, number }
final class AppInput extends StatelessWidget {
  const AppInput({required this.controller, this.placeholder, this.kind = AppInputKind.text, this.errorText, this.validator, super.key});
  final TextEditingController controller;
  final String? placeholder;
  final AppInputKind kind;
  final String? errorText;
  final String? Function(String?)? validator;
  @override Widget build(BuildContext context) => ConstrainedBox(
    constraints: const BoxConstraints(minHeight: 44),
    child: TextFormField(
      controller: controller, validator: validator,
      obscureText: kind == AppInputKind.password,
      keyboardType: switch (kind) {
        AppInputKind.email => TextInputType.emailAddress, AppInputKind.number => TextInputType.number,
        _ => TextInputType.text,
      },
      decoration: InputDecoration(hintText: placeholder, errorText: errorText),
    ),
  );
}
`; }

function card() { return `import 'package:flutter/widgets.dart';
import '../design/tokens.dart';
final class AppCard extends StatelessWidget {
  const AppCard({required this.child, this.padding = SpaceToken.lg, super.key});
  final Widget child;
  final SpaceToken padding;
  @override Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: colorsOf(context)[ColorRole.surface],
      borderRadius: BorderRadius.circular(radius[RadiusToken.md]!),
      boxShadow: shadow[ShadowToken.raised],
    ),
    child: Padding(padding: EdgeInsets.all(space[padding]!), child: child),
  );
}
`; }

function states() { return `import 'package:flutter/widgets.dart';
import '../design/tokens.dart';
import 'app_button.dart';
import 'app_stack.dart';
import 'app_text.dart';
final class AppEmptyState extends StatelessWidget {
  const AppEmptyState({required this.title, this.description, super.key});
  final String title;
  final String? description;
  @override Widget build(BuildContext context) => AppStack(children: [
    AppText(title, role: TextRole.heading), if (description case final value?) AppText(value, tone: TextTone.muted),
  ]);
}
final class AppErrorState extends StatelessWidget {
  const AppErrorState({required this.title, required this.retryLabel, required this.onRetry, super.key});
  final String title;
  final String retryLabel;
  final VoidCallback onRetry;
  @override Widget build(BuildContext context) => AppStack(children: [
    AppText(title, role: TextRole.heading, tone: TextTone.danger, live: true),
    AppButton(label: retryLabel, onPressed: onRetry),
  ]);
}
`; }

function list() { return `import 'package:flutter/widgets.dart';
final class AppList<T> extends StatelessWidget {
  const AppList({required this.items, required this.itemBuilder, super.key});
  final List<T> items;
  final Widget Function(BuildContext context, T item) itemBuilder;
  @override Widget build(BuildContext context) => ListView.builder(
    itemCount: items.length, itemBuilder: (context, index) => itemBuilder(context, items[index]),
  );
}
`; }

function barrel() { return `export 'app_button.dart';
export 'app_card.dart';
export 'app_field.dart';
export 'app_input.dart';
export 'app_list.dart';
export 'app_screen.dart';
export 'app_stack.dart';
export 'app_states.dart';
export 'app_text.dart';
`; }

const invokedDirectly = process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: skies-flutter-design <flutter-project>");
    process.exitCode = 2;
  } else {
    const lib = join(resolve(root), "lib");
    const files = renderDesignKit();
    const collisions = Object.keys(files).map((path) => join(lib, path)).filter(existsSync);
    if (collisions.length > 0) {
      console.error(`refusing to overwrite ${collisions.join(", ")}`);
      process.exitCode = 1;
    } else {
      for (const [path, source] of Object.entries(files)) {
        const output = join(lib, path);
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, source);
        console.log(`created ${output}`);
      }
    }
  }
}
