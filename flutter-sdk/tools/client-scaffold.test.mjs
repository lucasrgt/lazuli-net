import assert from "node:assert/strict";
import test from "node:test";

import { renderClientSeam, renderMutationSeam, renderSessionSeam } from "./client-scaffold.mjs";

test("renders base URL, injected auth and typed ErrorBody mapping in the hand-owned seam", () => {
  const source = renderClientSeam({ packageName: "sample_api", clientClass: "SampleApi" });

  assert.match(source, /Dio\(BaseOptions\(baseUrl: baseUrl\)\)/);
  assert.match(source, /List<Interceptor> interceptors/);
  assert.match(source, /SkiesAuthInterceptor/);
  assert.match(source, /executeSkiesRequest<T, ErrorBody>/);
  assert.match(source, /standardSerializers\.deserializeWith\(ErrorBody\.serializer, data\)/);
  assert.match(source, /late final SampleApi api/);
});

test("renders identity and mutation defaults as app-owned composition", () => {
  assert.match(renderSessionSeam(), /onIdentityChanged: clearIdentityCache/);
  assert.match(renderSessionSeam(), /onSessionChanged: resetSessionCache/);
  assert.match(renderMutationSeam(), /MutationBoundary/);
  assert.match(renderMutationSeam(), /invalidateQueries/);
});

test("rejects invalid generated identifiers", () => {
  assert.throws(() => renderClientSeam({ packageName: "Bad-Package", clientClass: "Api" }));
  assert.throws(() => renderClientSeam({ packageName: "api", clientClass: "api" }));
});
