/** Quote a server-generated PostgreSQL identifier, including embedded quotes defensively. */
export function quoteIdentifier(identifier: string): string {
  if (identifier.includes("\0")) throw new TypeError("PostgreSQL identifiers cannot contain NUL bytes.");
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Replace only the URL database path while preserving encoded credentials, host, port, and query parameters. */
export function connectionUrlFor(maintenanceUrl: string, database: string): string {
  const url = new URL(maintenanceUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new TypeError("maintenanceUrl must use the postgres or postgresql protocol.");
  }
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.href;
}

/** Reject an injected runtime identifier that could escape the harness's stale-database namespace. */
export function internalIdentifier(identifier: string, prefix: string): string {
  if (!identifier.startsWith(prefix) || identifier.length > 63 || !/^[a-z0-9_]+$/u.test(identifier)) {
    throw new TypeError(`The runtime generated an invalid ${prefix} database identifier.`);
  }
  return identifier;
}
