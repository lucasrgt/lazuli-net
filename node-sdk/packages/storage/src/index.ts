import { createWriteStream } from "node:fs";
import { mkdir, open, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** A time-limited instruction for uploading a file directly to a storage backend. */
export interface UploadIntent {
  /** The storage key that will identify the uploaded file. */
  readonly key: string;
  /** The backend URL to which the client sends the bytes. */
  readonly url: string;
  /** The HTTP method required by the upload URL. */
  readonly method: "PUT";
  /** The content type the client must send with the upload. */
  readonly contentType: string;
  /** The instant at which the upload URL stops being valid. */
  readonly expiresAt: Date;
}

/**
 * The vendor-neutral file storage boundary used by application slices. Provider integrations implement this
 * contract in their own packages so cloud SDKs do not leak into application code.
 */
export interface FileStorage {
  /** Store a Node.js readable stream under a relative key and return that key. */
  save(key: string, content: Readable, contentType: string, signal?: AbortSignal): Promise<string>;

  /** Issue an upload instruction whose lifetime is expressed in milliseconds. */
  getUploadUrl(
    key: string,
    contentType: string,
    ttlMilliseconds: number,
    signal?: AbortSignal,
  ): Promise<UploadIntent>;

  /** Return a read URL whose requested lifetime is expressed in milliseconds. */
  getUrl(key: string, ttlMilliseconds: number, signal?: AbortSignal): Promise<string>;

  /** Remove a key, succeeding when it is already absent. */
  delete(key: string, signal?: AbortSignal): Promise<void>;
}

/**
 * A local development store that writes beneath one configured root and emits plain URLs. It deliberately does
 * not emulate signatures: an Express adapter can use {@link openRead} to serve the returned URLs.
 */
export class LocalFileStorage implements FileStorage {
  readonly #rootDirectory: string;
  readonly #baseUrl: string;

  /** Create a local store backed by `rootDirectory` and served beneath `baseUrl`. */
  constructor(rootDirectory: string, baseUrl: string) {
    assertNonEmpty(rootDirectory, "rootDirectory");
    assertNonEmpty(baseUrl, "baseUrl");
    this.#rootDirectory = resolve(rootDirectory);
    this.#baseUrl = baseUrl.replace(/\/+$/u, "");
  }

  /** Store a stream without buffering it in memory. */
  async save(key: string, content: Readable, contentType: string, signal?: AbortSignal): Promise<string> {
    const target = this.#resolveKey(key);
    void contentType;
    signal?.throwIfAborted();
    await mkdir(dirname(target), { recursive: true });
    signal?.throwIfAborted();

    const output = createWriteStream(target, { flags: "w", signal });
    await pipeline(content, output, { signal });
    return key;
  }

  /** Return the plain local PUT intent used by development HTTP adapters. */
  async getUploadUrl(
    key: string,
    contentType: string,
    ttlMilliseconds: number,
    signal?: AbortSignal,
  ): Promise<UploadIntent> {
    signal?.throwIfAborted();
    const url = this.#urlFor(key);
    const expiresAt = new Date(Date.now() + ttlMilliseconds);
    signal?.throwIfAborted();
    return { key, url, method: "PUT", contentType, expiresAt };
  }

  /** Return the plain local read URL; local URLs do not expire or carry signatures. */
  async getUrl(key: string, ttlMilliseconds: number, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    void ttlMilliseconds;
    const url = this.#urlFor(key);
    signal?.throwIfAborted();
    return url;
  }

  /** Open a stored key for an HTTP adapter, returning `null` only when it is absent. */
  async openRead(key: string, signal?: AbortSignal): Promise<Readable | null> {
    return this.#openRead(key, signal === undefined ? {} : { signal });
  }

  /** Return a local file's current byte length, or `null` when the key is absent. */
  async getSize(key: string, signal?: AbortSignal): Promise<number | null> {
    const target = this.#resolveKey(key);
    signal?.throwIfAborted();
    try {
      const details = await stat(target);
      signal?.throwIfAborted();
      return details.isFile() ? details.size : null;
    } catch (caught) {
      if (isFileSystemError(caught, "ENOENT")) return null;
      throw caught;
    }
  }

  /** Open one validated inclusive byte range for the local development HTTP adapter. */
  async openReadRange(
    key: string,
    start: number,
    end: number,
    signal?: AbortSignal,
  ): Promise<Readable | null> {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
      throw new RangeError("Local file byte ranges require safe integers with 0 <= start <= end.");
    }
    return this.#openRead(key, signal === undefined ? { start, end } : { start, end, signal });
  }

  /** Delete a key without failing when another caller already removed it. */
  async delete(key: string, signal?: AbortSignal): Promise<void> {
    const target = this.#resolveKey(key);
    signal?.throwIfAborted();

    try {
      await unlink(target);
    } catch (caught) {
      if (!isFileSystemError(caught, "ENOENT")) throw caught;
    }
    signal?.throwIfAborted();
  }

  async #openRead(
    key: string,
    options: { readonly start?: number; readonly end?: number; readonly signal?: AbortSignal },
  ): Promise<Readable | null> {
    const target = this.#resolveKey(key);
    options.signal?.throwIfAborted();
    try {
      const handle = await open(target, "r");
      try {
        options.signal?.throwIfAborted();
        return handle.createReadStream(options);
      } catch (caught) {
        await handle.close();
        throw caught;
      }
    } catch (caught) {
      if (isFileSystemError(caught, "ENOENT")) return null;
      throw caught;
    }
  }

  #resolveKey(key: string): string {
    const segments = keySegments(key);
    const target = resolve(this.#rootDirectory, ...segments);
    const fromRoot = relative(this.#rootDirectory, target);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new TypeError("Storage keys cannot escape the configured root directory.");
    }
    return target;
  }

  #urlFor(key: string): string {
    const segments = keySegments(key);
    this.#resolveKey(key);
    const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join("/");
    return `${this.#baseUrl}/${encodedPath}`;
  }
}

function keySegments(key: string): readonly string[] {
  assertNonEmpty(key, "key");
  if (key.startsWith("/") || key.startsWith("\\")) {
    throw new TypeError("Storage keys must be relative paths.");
  }
  if (/^[A-Za-z]:/u.test(key)) {
    throw new TypeError("Storage keys cannot use Windows drive paths.");
  }

  const segments = key.split(/[\\/]/u);
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new TypeError("Storage keys must contain only non-traversing path segments.");
  }
  return segments;
}

function assertNonEmpty(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    throw new TypeError(`${name} must be a non-empty string without NUL bytes.`);
  }
}

function isFileSystemError(caught: unknown, code: string): caught is NodeJS.ErrnoException {
  return caught instanceof Error && "code" in caught && caught.code === code;
}
