#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Render the hand-owned seam between a generated package and application behavior. */
export function renderClientSeam({ packageName, clientClass }) {
  if (!/^[a-z][a-z0-9_]*$/.test(packageName)) throw new TypeError("invalid Dart package name");
  if (!/^[A-Z][A-Za-z0-9]*$/.test(clientClass)) throw new TypeError("invalid generated client class");

  return `import 'package:dio/dio.dart';
import 'package:skies_flutter/skies_flutter.dart';
import 'package:${packageName}/${packageName}.dart';

/// The hand-owned HTTP seam. Generated APIs remain plumbing; auth and error behavior live here.
final class SkiesClient {
  SkiesClient({
    required String baseUrl,
    AccessTokenProvider? accessToken,
    SessionRefresher? refreshSession,
    AuthRoutePredicate? isAuthRoute,
    List<Interceptor> interceptors = const [],
  }) {
    final dio = Dio(BaseOptions(baseUrl: baseUrl));
    final configuredInterceptors = <Interceptor>[...interceptors];
    if (accessToken != null) {
      configuredInterceptors.add(SkiesAuthInterceptor(
        dio: dio,
        accessToken: accessToken,
        refreshSession: refreshSession,
        isAuthRoute: isAuthRoute,
      ));
    }
    api = ${clientClass}(dio: dio, interceptors: configuredInterceptors);
  }

  /// The generated API surface. ViewModels reach it only through injected loaders or repositories.
  late final ${clientClass} api;

  /// Executes a generated operation and maps its canonical error body.
  Future<T> request<T>(Future<Response<T>> Function() operation) =>
      executeSkiesRequest<T, ErrorBody>(operation, decodeError: _decodeError);

  static ErrorBody _decodeError(Object? data) {
    final error = standardSerializers.deserializeWith(ErrorBody.serializer, data);
    if (error == null) {
      throw const FormatException('The Skies ErrorBody was null.');
    }
    return error;
  }
}
`;
}

/** Render the hand-owned identity seam without choosing storage or cache packages. */
export function renderSessionSeam() {
  return `import 'dart:async';

import 'package:skies_flutter/skies_flutter.dart';

SessionSeam createAppSession({
  required void Function(String? token) setAccessToken,
  required Future<AuthTokens?> Function(String refreshToken) refresh,
  required FutureOr<void> Function() clearIdentityCache,
  required FutureOr<void> Function() resetSessionCache,
  required RefreshTokenStore secureStore,
}) => SessionSeam(
  setAccessToken: setAccessToken,
  refresh: refresh,
  onIdentityChanged: clearIdentityCache,
  onSessionChanged: resetSessionCache,
  store: secureStore,
);
`;
}

/** Render the hand-owned mutation defaults from app-specific cache and feedback ports. */
export function renderMutationSeam() {
  return `import 'dart:async';

import 'package:skies_flutter/skies_flutter.dart';

MutationBoundary createMutationBoundary({
  required FutureOr<void> Function() invalidateQueries,
  required FeedbackSink feedback,
}) => MutationBoundary(
  invalidateQueries: invalidateQueries,
  feedback: feedback,
);
`;
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) return null;
    values[key.slice(2)] = value;
  }
  return values.package && values.class && (values.output || values["output-dir"]) ? values : null;
}

const invokedDirectly =
  process.argv[1] && import.meta.url.split("/").pop() === process.argv[1].replace(/\\/g, "/").split("/").pop();
if (invokedDirectly) {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    console.error("usage: skies-flutter-client-scaffold --package <dart_package> --class <GeneratedClient> (--output <skies_client.dart> | --output-dir <lib-directory>)");
    process.exitCode = 2;
  } else {
    const outputs = options["output-dir"]
      ? [
          [resolve(options["output-dir"], "skies_client.dart"), renderClientSeam({ packageName: options.package, clientClass: options.class })],
          [resolve(options["output-dir"], "session.dart"), renderSessionSeam()],
          [resolve(options["output-dir"], "mutations.dart"), renderMutationSeam()],
        ]
      : [[resolve(options.output), renderClientSeam({ packageName: options.package, clientClass: options.class })]];
    const collisions = outputs.map(([path]) => path).filter(existsSync);
    if (collisions.length > 0) {
      console.error(`refusing to overwrite hand-owned files ${collisions.join(", ")}`);
      process.exitCode = 1;
    } else {
      for (const [output, source] of outputs) {
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, source);
        console.log(`created ${output}`);
      }
    }
  }
}
