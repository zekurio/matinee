import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'json.dart';
import 'paths.dart';

/// A failed API request. [message] is the server's text for the user.
final class ApiException implements Exception {
  const ApiException({
    required this.status,
    this.code,
    this.message,
    this.data,
  });

  final int status;
  final String? code;
  final String? message;
  final Object? data;

  /// Reads the error's contract data, if this server sent a compatible shape.
  T? dataAs<T>(T Function(Object?) decode) {
    if (data == null) return null;
    try {
      return decode(data);
    } on TypeError {
      return null;
    } on FormatException {
      return null;
    }
  }

  @override
  String toString() => 'ApiException($status, $code, $message)';
}

/// A file to send in a multipart form.
final class FilePart {
  const FilePart({required this.bytes, required this.type, required this.name});

  final List<int> bytes;
  final String type;
  final String name;
}

sealed class RequestBody {
  const RequestBody();
}

final class JsonBody extends RequestBody {
  const JsonBody(this.value);

  final Object? value;
}

final class MultipartBody extends RequestBody {
  const MultipartBody({required this.files, this.fields = const {}});

  final Map<String, FilePart> files;
  final Map<String, String> fields;
}

/// Sends the generated procedures to the REST API under /api/v1.
final class ApiTransport {
  const ApiTransport(this.paths, this._client, [this._token]);

  final Paths paths;
  final http.Client _client;
  final String? _token;

  Future<T> call<T>(
    String method,
    List<String> path,
    T Function(Object?) decode, {
    Map<String, String> query = const {},
    RequestBody? body,
  }) async {
    final request = _request(method, path, query, body, 'application/json');
    final response = await _send(request);
    final answer = await response.stream.bytesToString();
    return decode(answer.isEmpty ? null : jsonDecode(answer));
  }

  Future<void> send(
    String method,
    List<String> path, {
    Map<String, String> query = const {},
    RequestBody? body,
  }) async {
    final request = _request(method, path, query, body, 'application/json');
    final response = await _send(request);
    await response.stream.drain<void>();
  }

  Stream<T> events<T>(
    String method,
    List<String> path,
    T Function(Object?) decode, {
    Map<String, String> query = const {},
    RequestBody? body,
  }) {
    final abort = Completer<void>();
    StreamSubscription<T>? subscription;
    late final StreamController<T> controller;
    controller = StreamController<T>(
      onListen: () {
        subscription =
            _eventMessages(
              () => _request(
                method,
                path,
                query,
                body,
                'text/event-stream',
                abortTrigger: abort.future,
              ),
              decode,
            ).listen(
              controller.add,
              onError: controller.addError,
              onDone: () => unawaited(controller.close()),
            );
      },
      onPause: () => subscription?.pause(),
      onResume: () => subscription?.resume(),
      onCancel: () async {
        abort.complete();
        try {
          await subscription?.cancel();
        } on http.RequestAbortedException {
          // The request was still waiting for a response when we aborted it.
        }
      },
    );
    return controller.stream;
  }

  http.BaseRequest _request(
    String method,
    List<String> path,
    Map<String, String> query,
    RequestBody? body,
    String accept, {
    Future<void>? abortTrigger,
  }) {
    final uri = paths.route(['api', 'v1', ...path], query: query);
    final http.BaseRequest request;
    switch (body) {
      case MultipartBody(:final files, :final fields):
        final form = http.AbortableMultipartRequest(
          method,
          uri,
          abortTrigger: abortTrigger,
        );
        form.fields.addAll(fields);
        for (final MapEntry(key: field, value: file) in files.entries) {
          form.files.add(
            http.MultipartFile.fromBytes(
              field,
              file.bytes,
              filename: file.name,
              contentType: http.MediaType.parse(file.type),
            ),
          );
        }
        request = form;
      case JsonBody() || null:
        final json = http.AbortableRequest(
          method,
          uri,
          abortTrigger: abortTrigger,
        );
        if (body case JsonBody(:final value)) {
          json.headers['content-type'] = 'application/json';
          json.bodyBytes = utf8.encode(jsonEncode(value));
        }
        request = json;
    }
    request.headers['accept'] = accept;
    if (_token case final token?) {
      request.headers['authorization'] = 'Bearer $token';
    }
    return request;
  }

  Future<http.StreamedResponse> _send(http.BaseRequest request) async {
    final response = await _client.send(request);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final text = await response.stream.bytesToString(
        const Utf8Codec(allowMalformed: true),
      );
      throw _apiError(text, status: response.statusCode);
    }
    return response;
  }

  Stream<T> _eventMessages<T>(
    http.BaseRequest Function() makeRequest,
    T Function(Object?) decode,
  ) async* {
    final response = await _send(makeRequest());

    var event = '';
    final data = <String>[];
    final lines = response.stream
        .transform(utf8.decoder)
        .transform(const LineSplitter());
    await for (final line in lines) {
      if (line.isEmpty) {
        if (event == 'done') return;
        if (event == 'error') throw _apiError(data.join('\n'));
        if (data.isNotEmpty && (event.isEmpty || event == 'message')) {
          yield decode(jsonDecode(data.join('\n')));
        }
        event = '';
        data.clear();
        continue;
      }

      final colon = line.indexOf(':');
      final field = colon < 0 ? line : line.substring(0, colon);
      if (field != 'event' && field != 'data') continue;
      final raw = colon < 0 ? '' : line.substring(colon + 1);
      final value = raw.startsWith(' ') ? raw.substring(1) : raw;
      if (field == 'event') {
        event = value;
      } else {
        data.add(value);
      }
    }
  }
}

ApiException _apiError(String text, {int? status}) {
  Object? decoded;
  try {
    decoded = jsonDecode(text);
  } on FormatException {
    return ApiException(status: status ?? 500);
  }
  if (decoded is JsonMap) {
    final message = decoded['message'];
    final code = decoded['code'];
    final bodyStatus = decoded['status'];
    return ApiException(
      status: status ?? (bodyStatus is int ? bodyStatus : 500),
      code: code is String ? code : null,
      message: message is String && message.trim().isNotEmpty ? message : null,
      data: decoded['data'],
    );
  }
  return ApiException(status: status ?? 500);
}
