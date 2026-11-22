import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/permissions.dart';

import 'fakes.dart';

User _user(List<String> permissions, {String role = 'user'}) => User.fromJson({
  ...userJson('ada'),
  'role': role,
  'permissions': permissions,
});

void main() {
  group('can', () {
    test('an admin holds every permission', () {
      final admin = _user(const [Permission.all], role: 'admin');
      for (final permission in Permission.values) {
        expect(can(admin, permission), isTrue, reason: permission);
      }
    });

    test('every account holds the base permissions without naming them', () {
      final plain = _user(const []);
      expect(can(plain, Permission.titleRead), isTrue);
      expect(can(plain, Permission.mediaPlay), isTrue);
      expect(can(plain, Permission.requestRead), isTrue);
      expect(can(plain, Permission.requestCreate), isFalse);
      expect(can(plain, Permission.adminUserRead), isFalse);
      expect(can(plain, Permission.all), isFalse);
    });

    test('a granted permission is held, and only that one', () {
      final scanner = _user(const [Permission.libraryScan]);
      expect(can(scanner, Permission.libraryScan), isTrue);
      expect(can(scanner, Permission.libraryUpdate), isFalse);
      expect(
        canAny(scanner, const [
          Permission.libraryUpdate,
          Permission.libraryScan,
        ]),
        isTrue,
      );
      expect(canAny(scanner, const [Permission.libraryDelete]), isFalse);
    });

    test('the role alone grants nothing; the server sends the list', () {
      expect(
        can(_user(const [], role: 'admin'), Permission.adminUserRead),
        isFalse,
      );
    });

    test('running the queue takes reading and answering it', () {
      expect(runsQueue(_user(const [Permission.adminRequestRead])), isFalse);
      expect(runsQueue(_user(const [Permission.adminRequestApprove])), isFalse);
      expect(runsQueue(_user(const [Permission.adminRequestRetry])), isFalse);
      expect(
        runsQueue(
          _user(const [
            Permission.adminRequestRead,
            Permission.adminRequestApprove,
          ]),
        ),
        isTrue,
      );
      expect(
        runsQueue(
          _user(const [
            Permission.adminRequestRead,
            Permission.adminRequestDecline,
          ]),
        ),
        isTrue,
      );
      expect(runsQueue(_user(const [Permission.all], role: 'admin')), isTrue);
    });
  });

  group('the permission lists', () {
    test('come from the contract', () {
      final source = File('../../packages/contracts/src/permissions.ts')
          .readAsStringSync();
      for (final permission in Permission.values) {
        expect(source, contains('"$permission"'), reason: permission);
      }
      expect(Permission.values.first, Permission.all);
      expect(Permission.values.toSet(), hasLength(Permission.values.length));
      expect(Permission.values, containsAll(Permission.base));
    });

    test('sorting puts them in the contract\'s order, once each', () {
      expect(
        sortPermissions(const [
          Permission.mediaDownload,
          Permission.adminUserRead,
          Permission.mediaDownload,
          'not.a.permission',
        ]),
        [Permission.adminUserRead, Permission.mediaDownload],
      );
    });
  });
}
