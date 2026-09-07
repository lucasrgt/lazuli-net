import path from 'node:path';

const normalize = (value) => value.replaceAll('\\', '/');
const generated = (file) => /(?:^|\/)(?:client\.gen|generated)\//i.test(file);
const boundary = (file) => /\.(?:viewModel|view|test|spec)\.[cm]?[jt]sx?$/i.test(file);

// TypeScript owns parsing and module resolution. The graph carries exported symbols through generated
// barrels instead of treating a regenerated API file as a change to every hook imported from that file.
export function analyzeGeneratedConsumers(ts, { root, files, changes, compilerOptions = {} }) {
  root = path.resolve(root);
  const absolute = (file) => normalize(path.resolve(root, file));
  const current = new Map(Object.entries(files).map(([file, text]) => [absolute(file), text]));
  const previous = new Map(current);
  for (const change of changes) {
    if (change.before === null) previous.delete(absolute(change.path));
    else previous.set(absolute(change.path), change.before);
    if (change.after === null) current.delete(absolute(change.path));
    else current.set(absolute(change.path), change.after);
  }
  const inventory = new Set([...current.keys(), ...previous.keys()]);
  const directories = new Set();
  for (const file of inventory) {
    for (let directory = normalize(path.dirname(file)); !directories.has(directory); directory = normalize(path.dirname(directory))) {
      directories.add(directory);
      if (path.dirname(directory) === directory) break;
    }
  }
  const options = { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: root, paths: { '@/*': ['src/*'] }, ...compilerOptions };
  const host = {
    fileExists: (file) => inventory.has(normalize(file)),
    readFile: (file) => current.get(normalize(file)) ?? previous.get(normalize(file)),
    directoryExists: (directory) => directories.has(normalize(directory)),
    getCurrentDirectory: () => root,
    realpath: (file) => file,
  };
  const resolve = (specifier, from) => {
    const result = ts.resolveModuleName(specifier, from, options, host).resolvedModule;
    if (result && inventory.has(normalize(result.resolvedFileName))) return normalize(result.resolvedFileName);
    const local = specifier.startsWith('.') || Object.keys(options.paths ?? {}).some((alias) =>
      alias.includes('*') ? specifier.startsWith(alias.split('*')[0]) : specifier === alias);
    const extension = path.extname(specifier);
    if (local && (!extension || /\.[cm]?[jt]sx?$/.test(extension)))
      throw new Error(`Unresolved local import ${specifier} in ${path.relative(root, from)}`);
    return null;
  };
  const printer = ts.createPrinter({ removeComments: true });
  const cache = new Map();
  const parse = (file, text = '') => {
    const key = file + '\0' + text;
    if (cache.has(key)) return cache.get(key);
    const syntax = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (syntax.parseDiagnostics.length) throw new Error(`Cannot parse generated-client consumer ${path.relative(root, file)}`);
    // Erased types are checked across the entire application by tsc. Following ErrorBody's type through every
    // hook would turn an added error-code literal into a full runtime suite despite unchanged JavaScript.
    const emitted = /\.d\.[cm]?ts$/.test(file) ? '' : ts.transpileModule(text, {
      fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve,
        removeComments: true, ...compilerOptions, declaration: false, noEmit: false, emitDeclarationOnly: false,
        verbatimModuleSyntax: false, sourceMap: false, inlineSourceMap: false },
    }).outputText;
    const source = ts.createSourceFile(file, emitted, ts.ScriptTarget.Latest, true);
    const doc = { file, declarations: new Map(), exports: new Map(), imports: [], reexports: [], effects: [] };
    const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, source);
    const identifiers = (node) => {
      const names = new Set();
      const visit = (child) => { if (ts.isIdentifier(child)) names.add(child.text); ts.forEachChild(child, visit); };
      visit(node);
      return names;
    };
    const bindingNames = (name) => ts.isIdentifier(name) ? [name.text]
      : name.elements.flatMap((element) => ts.isBindingElement(element) ? bindingNames(element.name) : []);
    const dynamicImports = (node) => {
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
          || ts.isIdentifier(node.expression) && node.expression.text === 'require')
          && node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
        const target = resolve(node.arguments[0].text, file);
        if (target) doc.imports.push({ target, imported: '*', local: null });
      }
      ts.forEachChild(node, dynamicImports);
    };
    dynamicImports(source);
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const target = resolve(statement.moduleSpecifier.text, file);
        if (!target) continue;
        const clause = statement.importClause;
        if (!clause) doc.imports.push({ target, imported: '*', local: null });
        if (clause?.name) doc.imports.push({ target, imported: 'default', local: clause.name.text });
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) doc.imports.push({ target, imported: '*', local: bindings.name.text });
        if (bindings && ts.isNamedImports(bindings))
          for (const element of bindings.elements)
            doc.imports.push({ target, imported: element.propertyName?.text ?? element.name.text, local: element.name.text });
        continue;
      }
      if (ts.isExportDeclaration(statement)) {
        const target = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? resolve(statement.moduleSpecifier.text, file) : null;
        if (statement.moduleSpecifier && !target) {
          if (statement.moduleSpecifier.text.startsWith('.') || statement.moduleSpecifier.text.startsWith('@/'))
            throw new Error(`Unresolved local re-export in ${path.relative(root, file)}`);
          continue;
        }
        const clause = statement.exportClause;
        if (!clause && target) doc.reexports.push({ target, imported: '*', exported: '*' });
        else if (clause && ts.isNamespaceExport(clause) && target)
          doc.reexports.push({ target, imported: '*', exported: clause.name.text });
        else if (clause && ts.isNamedExports(clause))
          for (const element of clause.elements) {
            const imported = element.propertyName?.text ?? element.name.text;
            if (target) doc.reexports.push({ target, imported, exported: element.name.text });
            else doc.exports.set(element.name.text, imported);
          }
        continue;
      }
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
      const names = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.flatMap((declaration) => bindingNames(declaration.name))
        : statement.name && ts.isIdentifier(statement.name) ? [statement.name.text]
        : ts.isExportAssignment(statement) ? ['default'] : [];
      if (!names.length) {
        if (!ts.isEmptyStatement(statement)) doc.effects.push({ text: print(statement), references: identifiers(statement) });
        continue;
      }
      for (const name of names) {
        const previousDeclaration = doc.declarations.get(name);
        doc.declarations.set(name, {
          text: (previousDeclaration?.text ?? '') + print(statement),
          references: new Set([...(previousDeclaration?.references ?? []), ...identifiers(statement)]),
        });
        if (exported || ts.isExportAssignment(statement)) doc.exports.set(isDefault ? 'default' : name, name);
      }
    }
    cache.set(key, doc);
    return doc;
  };
  const docs = new Map();
  const getDoc = (file) => {
    if (!docs.has(file)) docs.set(file, parse(file, current.get(file) ?? previous.get(file) ?? ''));
    return docs.get(file);
  };
  const consumers = new Map();
  for (const file of inventory) {
    for (const imported of ts.preProcessFile(current.get(file) ?? previous.get(file) ?? '', true, true).importedFiles) {
      const target = resolve(imported.fileName, file);
      if (!target) continue;
      if (!consumers.has(target)) consumers.set(target, new Set());
      consumers.get(target).add(file);
    }
  }
  const oldDoc = (file) => parse(file, previous.get(file) ?? '');
  const exportedNames = (file, old = false, seen = new Set()) => {
    if (seen.has(file)) return new Set();
    seen.add(file);
    const doc = old ? oldDoc(file) : getDoc(file);
    const names = new Set(doc.exports.keys());
    for (const edge of doc.reexports) {
      if (edge.exported !== '*') names.add(edge.exported);
      else for (const name of exportedNames(edge.target, old, seen)) names.add(name);
    }
    return names;
  };
  const expandLocals = (doc, seeds) => {
    const affected = new Set(seeds);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [name, declaration] of doc.declarations)
        if (!affected.has(name) && [...declaration.references].some((reference) => affected.has(reference))) {
          affected.add(name); grew = true;
        }
    }
    const exports = new Set([...doc.exports].filter(([, local]) => affected.has(local)).map(([name]) => name));
    const effect = doc.effects.some((item) => [...item.references].some((name) => affected.has(name)));
    if (effect) exports.add('*');
    return { exports, used: effect || [...affected].some((name) => doc.declarations.has(name)) };
  };
  const selected = new Set();
  const pending = [];
  const visited = new Map();
  const enqueue = (file, names) => {
    const seen = visited.get(file) ?? new Set();
    const fresh = new Set([...names].filter((name) => !seen.has(name) && !seen.has('*')));
    if (!fresh.size) return;
    for (const name of fresh) seen.add(name);
    visited.set(file, seen);
    pending.push({ file, names: fresh });
  };
  for (const change of changes) {
    const file = absolute(change.path);
    const before = oldDoc(file);
    const after = parse(file, current.get(file) ?? '');
    const seeds = new Set();
    for (const name of new Set([...before.declarations.keys(), ...after.declarations.keys()]))
      if (before.declarations.get(name)?.text !== after.declarations.get(name)?.text) seeds.add(name);
    for (const edge of [...before.imports, ...after.imports])
      if (edge.local && !before.imports.some((old) => JSON.stringify(old) === JSON.stringify(edge))
          || edge.local && !after.imports.some((next) => JSON.stringify(next) === JSON.stringify(edge))) seeds.add(edge.local);
    const names = new Set([...expandLocals(before, seeds).exports, ...expandLocals(after, seeds).exports]);
    if (JSON.stringify(before.effects.map((item) => item.text)) !== JSON.stringify(after.effects.map((item) => item.text))) names.add('*');
    for (const exported of new Set([...before.exports.keys(), ...after.exports.keys()]))
      if (before.exports.get(exported) !== after.exports.get(exported)) names.add(exported);
    for (const edge of [...before.reexports, ...after.reexports]) {
      if (before.reexports.some((old) => JSON.stringify(old) === JSON.stringify(edge))
          && after.reexports.some((next) => JSON.stringify(next) === JSON.stringify(edge))) continue;
      if (edge.exported !== '*') names.add(edge.exported);
      else for (const name of new Set([...exportedNames(edge.target), ...exportedNames(edge.target, true)])) names.add(name);
    }
    enqueue(file, names);
  }
  while (pending.length) {
    const { file, names } = pending.shift();
    if (!generated(file) && boundary(file)) { selected.add(file); continue; }
    let reached = false;
    for (const consumer of consumers.get(file) ?? []) {
      const doc = getDoc(consumer);
      const locals = new Set();
      let sideEffect = false;
      const exports = new Set();
      for (const edge of doc.imports.filter((edge) => edge.target === file))
        if (names.has('*') || edge.imported === '*' || names.has(edge.imported)) {
          if (edge.local) locals.add(edge.local); else sideEffect = true;
        }
      for (const edge of doc.reexports.filter((edge) => edge.target === file)) {
        if (!names.has('*') && edge.imported !== '*' && !names.has(edge.imported)) continue;
        if (edge.exported === '*') for (const name of names) exports.add(name);
        else exports.add(edge.exported);
      }
      const expanded = expandLocals(doc, locals);
      for (const name of expanded.exports) exports.add(name);
      if (sideEffect) exports.add('*');
      if (!exports.size && !expanded.used && !sideEffect) continue;
      reached = true;
      if (!generated(consumer) && boundary(consumer)) selected.add(consumer);
      else if (exports.size) enqueue(consumer, exports);
      else selected.add(consumer);
    }
    if (!reached && !generated(file)) selected.add(file);
  }
  return { reliable: true, files: [...selected].map((file) => normalize(path.relative(root, file))).sort() };
}
