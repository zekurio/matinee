import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/unreachability.dart';

Unreachability reason(Object error, {bool network = true}) =>
    unreachabilityOf(error, hasNetwork: network);

void main() {
  test('without a network nothing else is worth saying', () {
    expect(
      reason(const SocketException('Connection refused'), network: false),
      Unreachability.noNetwork,
    );
    expect(
      reason(TimeoutException('slow'), network: false),
      Unreachability.noNetwork,
    );
  });

  test('a host that does not resolve is not found', () {
    expect(
      reason(
        const SocketException(
          'Failed host lookup: \'media.example.com\'',
          osError: OSError('No address associated with hostname', 7),
        ),
      ),
      Unreachability.notFound,
    );
  });

  test('a refused connection is refused, on each platform', () {
    for (final code in [111, 61, 10061]) {
      expect(
        reason(
          SocketException('x', osError: OSError('Connection refused', code)),
        ),
        Unreachability.refused,
      );
    }
    expect(
      reason(const SocketException('Connection refused')),
      Unreachability.refused,
    );
  });

  test(
    'a network that is unreachable counts as refused, as it did in Java',
    () {
      expect(
        reason(
          const SocketException(
            'x',
            osError: OSError('Network is unreachable', 101),
          ),
        ),
        Unreachability.refused,
      );
    },
  );

  test('a connection that took too long is a timeout', () {
    expect(reason(TimeoutException('no headers')), Unreachability.timeout);
    expect(
      reason(
        const SocketException(
          'x',
          osError: OSError('Connection timed out', 110),
        ),
      ),
      Unreachability.timeout,
    );
    expect(
      reason(
        const SocketException(
          'HTTP connection timed out after 0:00:15.000000, host: a, port: 443',
        ),
      ),
      Unreachability.timeout,
    );
  });

  test('a certificate that is not valid is a certificate', () {
    expect(
      reason(const HandshakeException('CERTIFICATE_VERIFY_FAILED')),
      Unreachability.certificate,
    );
    expect(reason(const TlsException('bad')), Unreachability.certificate);
    expect(
      reason(http.ClientException('Handshake error in client')),
      Unreachability.certificate,
    );
  });

  test('everything else is other', () {
    expect(reason(const ApiException(status: 500)), Unreachability.other);
    expect(
      reason(http.ClientException('Connection closed')),
      Unreachability.other,
    );
    expect(reason(const FormatException('html')), Unreachability.other);
    expect(
      reason(
        const SocketException('x', osError: OSError('No route to host', 113)),
      ),
      Unreachability.other,
    );
  });
}
