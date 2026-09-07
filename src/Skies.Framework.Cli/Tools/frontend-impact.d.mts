export function analyzeGeneratedConsumers(
  typescript: unknown,
  request: {
    root: string;
    files: Record<string, string>;
    changes: Array<{ path: string; before: string | null; after: string | null }>;
    compilerOptions?: object;
  },
): { reliable: boolean; files: string[] };
