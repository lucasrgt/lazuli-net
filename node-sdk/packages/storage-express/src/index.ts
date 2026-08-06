import type { IRouter, NextFunction, Request, RequestHandler, Response } from "express";
import mime from "mime/lite";
import type { Readable } from "node:stream";
import type { LocalFileStorage } from "@skiesjs/storage";

const fallbackContentType = "application/octet-stream";

/** Options for the explicitly registered local-file routes. */
export interface MapLocalFilesOptions {
  /** URL path beneath which local storage keys are uploaded and read. Defaults to `/files`. */
  readonly routePrefix?: string;
}

/**
 * Register anonymous `PUT` and `GET` wildcard routes that serve one explicit local storage instance. The returned
 * target is unchanged, making registration visible and as easy to remove as the call itself.
 */
export function mapLocalFiles<T extends IRouter>(
  appOrRouter: T,
  storage: LocalFileStorage,
  options: MapLocalFilesOptions = {},
): T {
  const prefix = normalizeRoutePrefix(options.routePrefix ?? "/files");
  const wildcardPath = `${prefix}/{*key}`;
  const missingKey: RequestHandler = (_request, response) => {
    response.sendStatus(400);
  };

  appOrRouter.put(prefix, missingKey);
  appOrRouter.get(prefix, missingKey);
  appOrRouter.put(wildcardPath, uploadHandler(storage));
  appOrRouter.get(wildcardPath, downloadHandler(storage));
  return appOrRouter;
}

function uploadHandler(storage: LocalFileStorage): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const key = storageKey(request);
    if (key === null) {
      response.sendStatus(400);
      return;
    }

    const requestAbort = watchRequestAbort(request, response);
    try {
      await storage.save(
        key,
        request,
        request.get("content-type") ?? fallbackContentType,
        requestAbort.signal,
      );
      if (!requestAbort.signal.aborted) response.status(204).send();
    } catch (caught) {
      if (!isAbort(caught, requestAbort.signal)) next(caught);
    } finally {
      requestAbort.cleanup();
    }
  };
}

function downloadHandler(storage: LocalFileStorage): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const key = storageKey(request);
    if (key === null) {
      response.sendStatus(400);
      return;
    }

    const requestAbort = watchRequestAbort(request, response);
    let stream: Readable | null;
    let size: number | null;
    let range: ByteRange | null;
    try {
      size = await storage.getSize(key, requestAbort.signal);
      if (size === null) {
        requestAbort.cleanup();
        response.sendStatus(404);
        return;
      }
      range = parseByteRange(request.get("range"), size);
      if (range === "unsatisfiable") {
        requestAbort.cleanup();
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-Range", `bytes */${size}`);
        response.sendStatus(416);
        return;
      }
      stream = range === null
        ? await storage.openRead(key, requestAbort.signal)
        : await storage.openReadRange(key, range.start, range.end, requestAbort.signal);
    } catch (caught) {
      requestAbort.cleanup();
      if (!isAbort(caught, requestAbort.signal)) next(caught);
      return;
    }

    if (requestAbort.signal.aborted) {
      stream?.destroy();
      requestAbort.cleanup();
      return;
    }
    if (stream === null) {
      requestAbort.cleanup();
      response.sendStatus(404);
      return;
    }

    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Type", mime.getType(key) ?? fallbackContentType);
    if (range === null) {
      response.setHeader("Content-Length", String(size));
    } else {
      response.status(206);
      response.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      response.setHeader("Content-Length", String(range.end - range.start + 1));
    }
    pipeDownload(stream, response, next, requestAbort);
  };
}

type ByteRange = { readonly start: number; readonly end: number } | "unsatisfiable";

function parseByteRange(header: string | undefined, size: number): ByteRange | null {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (!match || size === 0) return "unsatisfiable";
  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (startText === "" && endText === "") return "unsatisfiable";

  if (startText === "") {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText === "" ? size - 1 : Number(endText);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return "unsatisfiable";
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

interface RequestAbort {
  readonly signal: AbortSignal;
  readonly cleanup: () => void;
}

function watchRequestAbort(request: Request, response: Response): RequestAbort {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  const abortPrematureResponse = (): void => {
    if (!response.writableFinished) controller.abort();
  };
  request.once("aborted", abort);
  response.once("close", abortPrematureResponse);
  if (request.aborted) controller.abort();

  return {
    signal: controller.signal,
    cleanup: () => {
      request.off("aborted", abort);
      response.off("close", abortPrematureResponse);
    },
  };
}

function pipeDownload(
  stream: Readable,
  response: Response,
  next: NextFunction,
  requestAbort: RequestAbort,
): void {
  let settled = false;
  const cleanup = (): void => {
    if (settled) return;
    settled = true;
    requestAbort.cleanup();
    stream.off("error", onError);
    stream.off("close", cleanup);
    response.off("finish", cleanup);
    response.off("close", onResponseClose);
  };
  const onError = (caught: Error): void => {
    cleanup();
    if (!isAbort(caught, requestAbort.signal)) next(caught);
  };
  const onResponseClose = (): void => {
    if (response.writableFinished) cleanup();
    else stream.destroy();
  };

  stream.once("error", onError);
  stream.once("close", cleanup);
  response.once("finish", cleanup);
  response.once("close", onResponseClose);
  stream.pipe(response);
}

function storageKey(request: Request): string | null {
  const wildcard = request.params["key"];
  const parts = typeof wildcard === "string" ? [wildcard] : wildcard;
  if (!Array.isArray(parts) || parts.length === 0 || parts.some((part) => typeof part !== "string")) {
    return null;
  }

  const key = parts.join("/");
  if (key.trim().length === 0 || key.includes("\0") || key.startsWith("/") || key.startsWith("\\")) return null;
  if (/^[A-Za-z]:/u.test(key)) return null;
  const segments = key.split(/[\\/]/u);
  return segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ? null : key;
}

function normalizeRoutePrefix(routePrefix: string): string {
  if (typeof routePrefix !== "string" || routePrefix.trim().length === 0 || routePrefix.includes("\0")) {
    throw new TypeError("routePrefix must be a non-empty path without NUL bytes.");
  }

  const prefix = routePrefix.replace(/\/+$/u, "");
  if (!prefix.startsWith("/") || prefix.length === 0) {
    throw new TypeError("routePrefix must start with '/' and name at least one path segment.");
  }
  if (/[\\{}:*+?()[\]!#]/u.test(prefix)) {
    throw new TypeError("routePrefix cannot contain route parameters, wildcards, or URL control characters.");
  }
  const segments = prefix.slice(1).split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new TypeError("routePrefix must contain only non-traversing path segments.");
  }
  return prefix;
}

function isAbort(caught: unknown, signal: AbortSignal): boolean {
  return signal.aborted && caught instanceof Error && caught.name === "AbortError";
}
