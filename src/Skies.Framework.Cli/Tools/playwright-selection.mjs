// Playwright accepts its own --list lines as a --test-list file. Preserve the project and complete title path
// instead of building a grep that can accidentally execute another case in the same spec.
export function selectPlaywrightCases(output, flows) {
  const listed = output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/(?:^|\s)›\s+(.+?):\d+:\d+\s+›\s+(.+)$/)
      ?? line.match(/^\s*(.+?):\d+:\d+\s+›\s+(.+)$/);
    return match ? [{ line: line.trim(), spec: match[1].replaceAll('\\', '/').replace(/^\.\//, ''), title: match[2].trim() }] : [];
  });
  const selected = new Set();
  for (const flow of flows) {
    if (!flow.case?.trim()) throw new Error(`Selected web flow ${flow.id} has no executable case`);
    const expected = flow.spec.replaceAll('\\', '/').replace(/^\.\//, '');
    const inSpec = listed.filter((test) =>
      (test.spec === expected || expected.endsWith('/' + test.spec) || test.spec.endsWith('/' + expected))
    );
    const exact = inSpec.filter((test) => test.title === flow.case);
    const matches = exact.length ? exact : inSpec.filter((test) => test.title.endsWith(' › ' + flow.case));
    if (!matches.length) throw new Error(`Selected web flow ${flow.id}: ${flow.spec} / ${flow.case} was not collected`);
    if (new Set(matches.map((test) => `${test.spec}\0${test.title}`)).size !== 1)
      throw new Error(`Selected web flow ${flow.id} is ambiguous; declare its complete Playwright title path`);
    for (const match of matches) selected.add(match.line);
  }
  return [...selected].sort();
}
