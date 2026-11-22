import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../api/matinee_api.dart';
import '../l10n/app_localizations.dart';
import '../l10n/server_text.dart';

/// A failed request in a line the person can act on: the server's own words
/// when it sent some, that it isn't answering when nothing reached it, and the
/// connection dropping for the rest. [error] is what a client call threw, so
/// this is where an error of unknown type is read.
String describeFailure(AppLocalizations l, Object error) => switch (error) {
  ApiException(:final message) => message?.serverWords(l) ?? l.errorServer,
  SocketException() ||
  TimeoutException() ||
  TlsException() ||
  http.ClientException() => l.errorUnreachable,
  FormatException() || TypeError() => l.errorUnreadable,
  _ => l.errorConnectionLost,
};

/// Whether [error] means the server couldn't be reached or the connection broke
/// off, not that it answered with an error: a page then shows only the cloud
/// and Try again.
bool isDisconnect(Object error) => switch (error) {
  SocketException() ||
  TimeoutException() ||
  TlsException() ||
  http.ClientException() => true,
  _ => false,
};
