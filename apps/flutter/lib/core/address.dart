/// How the app writes and compares server addresses.
library;

bool _isDefaultPort(String scheme, int port) =>
    (scheme == 'https' && port == 443) || (scheme == 'http' && port == 80);

String _hostText(Uri url) =>
    url.host.contains(':') ? '[${url.host}]' : url.host;

/// `https://media.example.com`, as the app shows its server.
String displayOf(Uri url) {
  final port = _isDefaultPort(url.scheme, url.port) ? '' : ':${url.port}';
  return '${url.scheme}://${_hostText(url)}$port';
}

/// The form a server's origin is saved and looked up in:
/// `https://media.example.com/`.
String originKey(Uri url) => '${displayOf(url)}/';

/// The server a saved [key] names, or null when it isn't an http or https
/// origin.
Uri? parseOrigin(String key) => _origin(Uri.tryParse(key));

Uri? _origin(Uri? url) {
  if (url == null || !url.hasAuthority || url.host.isEmpty) return null;
  if (url.scheme != 'http' && url.scheme != 'https') return null;
  if (url.host.contains(RegExp(r'\s'))) return null;
  if (url.port < 1 || url.port > 65535) return null;
  return Uri(scheme: url.scheme, host: url.host, port: url.port, path: '/');
}

/// Whether [url] is at [origin], by scheme, host, and port.
bool sameOrigin(Uri url, Uri origin) =>
    url.scheme == origin.scheme &&
    url.host == origin.host &&
    url.port == origin.port;

/// `host:` with nothing after the colon, which parses as the default port
/// but isn't an address anyone typed on purpose.
bool _emptyPort(String address) =>
    RegExp(r'^[^:/?#]+://[^/?#]*:(?=[/?#]|$)').hasMatch(address);

/// The origins to try for what the person typed. Matinee lives at an
/// origin's root, so a path, query, and fragment are dropped. Without a
/// scheme it tries https, then http.
List<Uri> serverCandidates(String input) {
  var text = input.trim();
  while (text.endsWith('/')) {
    text = text.substring(0, text.length - 1);
  }
  // Parsing would escape the spaces into a host that never answers.
  if (text.isEmpty || text.contains(RegExp(r'\s'))) return const [];
  final prefixes = text.contains('://')
      ? const ['']
      : const ['https://', 'http://'];
  return [
    for (final prefix in prefixes)
      if (!_emptyPort('$prefix$text')) ?_origin(Uri.tryParse('$prefix$text')),
  ];
}
