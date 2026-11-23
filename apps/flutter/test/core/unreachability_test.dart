import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
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

  test("Cronet's errors read as dart:io's do", () {
    http.ClientException cronet(String error, int code, int internal) =>
        http.ClientException(
          'Exception in CronetUrlRequest: net::$error, '
          'ErrorCode=$code, InternalErrorCode=$internal, Retryable=false',
        );
    expect(
      reason(cronet('ERR_NAME_NOT_RESOLVED', 1, -105)),
      Unreachability.notFound,
    );
    expect(
      reason(cronet('ERR_CONNECTION_REFUSED', 7, -102)),
      Unreachability.refused,
    );
    expect(
      reason(cronet('ERR_ADDRESS_UNREACHABLE', 9, -109)),
      Unreachability.refused,
    );
    expect(
      reason(cronet('ERR_CONNECTION_TIMED_OUT', 6, -118)),
      Unreachability.timeout,
    );
    expect(reason(cronet('ERR_TIMED_OUT', 4, -7)), Unreachability.timeout);
    expect(
      reason(cronet('ERR_CERT_AUTHORITY_INVALID', 11, -202)),
      Unreachability.certificate,
    );
    expect(
      reason(cronet('ERR_SSL_PROTOCOL_ERROR', 11, -107)),
      Unreachability.certificate,
    );
    expect(
      reason(cronet('ERR_CONNECTION_RESET', 8, -101)),
      Unreachability.other,
    );
  });
}
