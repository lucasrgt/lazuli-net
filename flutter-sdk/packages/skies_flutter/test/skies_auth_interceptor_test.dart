import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skies_flutter/skies_flutter.dart';

void main() {
  test(
    'injects bearer access and replays once after a single-flight refresh',
    () async {
      var token = 'expired';
      var refreshes = 0;
      var requests = 0;
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      server.listen((request) async {
        requests += 1;
        request.response.headers.contentType = ContentType.json;
        if (request.headers.value(HttpHeaders.authorizationHeader) ==
            'Bearer current') {
          request.response.write(jsonEncode(<String, Object?>{'ok': true}));
        } else {
          request.response.statusCode = HttpStatus.unauthorized;
          request.response.write(
            jsonEncode(<String, Object?>{'code': 'auth.expired'}),
          );
        }
        await request.response.close();
      });
      final dio = Dio(
        BaseOptions(baseUrl: 'http://${server.address.host}:${server.port}'),
      );
      dio.interceptors.add(
        SkiesAuthInterceptor(
          dio: dio,
          accessToken: () => token,
          refreshSession: () async {
            refreshes += 1;
            await Future<void>.delayed(const Duration(milliseconds: 20));
            token = 'current';
            return true;
          },
        ),
      );

      final responses = await Future.wait([
        dio.get<Object?>('/one'),
        dio.get<Object?>('/two'),
      ]);

      expect(responses.every((response) => response.statusCode == 200), isTrue);
      expect(refreshes, 1);
      expect(requests, 4);
    },
  );
}
