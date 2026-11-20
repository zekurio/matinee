import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/device_codes.dart';
import '../../core/failure_text.dart';
import '../../core/qr_scanner.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../query/server_data.dart';
import 'devices.dart';

/// Signing in a TV or another app as this account, from Settings, Account,
/// as the Kotlin app's `LinkDeviceScreen`: the camera reads the QR code the
/// device shows, or the person types its code, and then approves it, as
/// the web's /link page does. The device notices on its next poll.
class LinkDeviceScreen extends StatefulWidget {
  const LinkDeviceScreen({super.key});

  @override
  State<LinkDeviceScreen> createState() => _LinkDeviceScreenState();
}

class _LinkDeviceScreenState extends State<LinkDeviceScreen> {
  /// The code being checked, and the server its QR code named. Typed codes
  /// name none.
  ScannedCode? _code;
  var _typed = false;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final code = _code;
    return PageFrame(
      title: l.linkTitle,
      backLabel: l.commonBack,
      onBack: () => context.pop(),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          CardMetrics.gutter,
          8,
          CardMetrics.gutter,
          MediaQuery.paddingOf(context).bottom + 24,
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (code == null)
                  _ScanStep(
                    onCode: (scanned, {required typed}) => setState(() {
                      _code = scanned;
                      _typed = typed;
                    }),
                  )
                else
                  ApproveStep(
                    key: ValueKey(code.userCode),
                    userCode: code.userCode,
                    from: code.server,
                    typed: _typed,
                    onAgain: () => setState(() => _code = null),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

typedef _OnCode = void Function(ScannedCode code, {required bool typed});

/// The camera, where the device has one, and the field for typing the code.
class _ScanStep extends ConsumerWidget {
  const _ScanStep({required this.onCode});

  final _OnCode onCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final camera = ref.watch(cameraPresentProvider).value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (camera == true) ...[
          // A new picture for a new orientation, so it stands upright.
          CameraScanner(
            key: ValueKey(MediaQuery.orientationOf(context)),
            onCode: (code) => onCode(code, typed: false),
          ),
          const SizedBox(height: 32),
          Text(
            l.linkOrEnter,
            style: KitText.base.style(
              color: colors.foreground,
              weight: FontWeight.w600,
            ),
          ),
        ] else if (camera == false)
          // A TV signing in another TV: no camera, only the code.
          Text(
            l.linkEnterCode,
            style: KitText.sm.style(color: colors.mutedForeground),
          ),
        const SizedBox(height: 12),
        CodeField(
          onCode: (code) => onCode(ScannedCode(code, null), typed: true),
        ),
      ],
    );
  }
}

/// Typing the code the device shows, checked as the contract's `UserCode`.
class CodeField extends StatefulWidget {
  const CodeField({super.key, required this.onCode});

  final ValueChanged<String> onCode;

  @override
  State<CodeField> createState() => _CodeFieldState();
}

class _CodeFieldState extends State<CodeField> {
  final _text = TextEditingController();
  var _tried = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _submit() {
    final parsed = UserCode.parse(_text.text);
    setState(() => _tried = true);
    if (parsed != null) widget.onCode(parsed);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final invalid = _tried && UserCode.parse(_text.text) == null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MatineeTextField(
          controller: _text,
          placeholder: l.linkCodePlaceholder,
          error: invalid ? l.linkCodeInvalid : null,
          textCapitalization: TextCapitalization.characters,
          autocorrect: false,
          textInputAction: TextInputAction.go,
          inputFormatters: [LengthLimitingTextInputFormatter(9)],
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: 12),
        MatineeButton(
          onPressed: _text.text.trim().isEmpty ? null : _submit,
          look: ButtonLook.secondary,
          child: Text(l.linkContinue),
        ),
      ],
    );
  }
}

const _viewfinderShape = BorderRadius.all(Radius.circular(16));

/// A square of the camera's picture, once the person allows it, with what
/// it found under it.
class CameraScanner extends ConsumerStatefulWidget {
  const CameraScanner({super.key, required this.onCode});

  final ValueChanged<ScannedCode> onCode;

  @override
  ConsumerState<CameraScanner> createState() => _CameraScannerState();
}

class _CameraScannerState extends ConsumerState<CameraScanner> {
  late final AppLifecycleListener _lifecycle;
  bool? _allowed;

  /// Prompts shown: Android stops showing it after the second no, and then
  /// only its settings can allow the camera.
  var _asked = 0;
  var _failed = false;

  /// A QR code that isn't a Matinee sign-in was in view a moment ago.
  var _foreign = false;
  Timer? _foreignTimer;
  var _done = false;

  QrScanner get _scanner => ref.read(qrScannerProvider);

  @override
  void initState() {
    super.initState();
    // Checked again on coming back, as from the app's page in the settings.
    _lifecycle = AppLifecycleListener(onResume: _check);
    unawaited(_first());
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _foreignTimer?.cancel();
    super.dispose();
  }

  Future<void> _first() async {
    var allowed = await _allowedNow();
    if (!allowed && _asked == 0) {
      _asked = 1;
      allowed = await _request();
    }
    if (mounted) setState(() => _allowed = allowed);
  }

  Future<void> _check() async {
    final allowed = await _allowedNow();
    if (mounted && allowed != _allowed) setState(() => _allowed = allowed);
  }

  Future<bool> _allowedNow() async {
    try {
      return await _scanner.cameraAllowed();
    } on PlatformException {
      return false;
    }
  }

  Future<bool> _request() async {
    try {
      return await _scanner.requestCamera();
    } on PlatformException {
      return false;
    }
  }

  Future<void> _allow() async {
    if (_asked >= 2) {
      await _scanner.openAppSettings();
      return;
    }
    _asked++;
    final allowed = await _request();
    if (mounted) setState(() => _allowed = allowed);
  }

  void _read(String text) {
    if (_done) return;
    final scanned = scannedCode(text);
    if (scanned != null) {
      _done = true;
      unawaited(HapticFeedback.mediumImpact());
      widget.onCode(scanned);
      return;
    }
    _foreignTimer?.cancel();
    _foreignTimer = Timer(const Duration(milliseconds: 2500), () {
      if (mounted) setState(() => _foreign = false);
    });
    if (!_foreign) setState(() => _foreign = true);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final allowed = _allowed;
    final showing = allowed == true && !_failed;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AspectRatio(
          aspectRatio: 1,
          child: DecoratedBox(
            position: DecorationPosition.foreground,
            decoration: BoxDecoration(
              borderRadius: _viewfinderShape,
              border: Border.all(color: colors.border),
            ),
            child: ClipRRect(
              borderRadius: _viewfinderShape,
              child: ColoredBox(
                color: colors.surface,
                child: _failed
                    ? _CameraNotice(text: l.linkCameraFailed)
                    : allowed == true
                    ? Stack(
                        fit: StackFit.expand,
                        children: [
                          Viewfinder(
                            onText: _read,
                            onFailed: () => setState(() => _failed = true),
                          ),
                          const Padding(
                            padding: EdgeInsets.all(40),
                            child: CustomPaint(painter: _ScanCorners()),
                          ),
                        ],
                      )
                    : allowed == false
                    ? _CameraNotice(
                        text: l.linkCameraNeeded,
                        action: MatineeButton(
                          onPressed: _allow,
                          look: ButtonLook.outline,
                          child: Text(l.linkCameraAllow),
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            ),
          ),
        ),
        // What to do with the picture, while there is one.
        if (showing) ...[
          const SizedBox(height: 12),
          Text(
            _foreign ? l.linkScanForeign : l.linkScanHint,
            textAlign: TextAlign.center,
            style: KitText.sm.style(
              color: _foreign ? colors.foreground : colors.mutedForeground,
            ),
          ),
        ],
      ],
    );
  }
}

class _CameraNotice extends StatelessWidget {
  const _CameraNotice({required this.text, this.action});

  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final action = this.action;
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          KitIcon(Lucide.cameraOff, size: 28, color: colors.mutedForeground),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: KitText.sm.style(color: colors.mutedForeground),
          ),
          if (action != null) ...[const SizedBox(height: 16), action],
        ],
      ),
    );
  }
}

/// Four corners over the picture, where the QR code should go.
class _ScanCorners extends CustomPainter {
  const _ScanCorners();

  @override
  void paint(Canvas canvas, Size size) {
    final arm = size.shortestSide / 6;
    final paint = Paint()
      ..color = const Color(0xFFFFFFFF)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    for (final (corner, x, y) in [
      (Offset.zero, 1.0, 1.0),
      (Offset(size.width, 0), -1.0, 1.0),
      (Offset(0, size.height), 1.0, -1.0),
      (Offset(size.width, size.height), -1.0, -1.0),
    ]) {
      canvas
        ..drawLine(corner, corner + Offset(arm * x, 0), paint)
        ..drawLine(corner, corner + Offset(0, arm * y), paint);
    }
  }

  @override
  bool shouldRepaint(_ScanCorners oldDelegate) => false;
}

/// The camera's picture, filling the square, with every QR code in it
/// handed to [onText] while it shows.
class Viewfinder extends ConsumerStatefulWidget {
  const Viewfinder({super.key, required this.onText, required this.onFailed});

  final ValueChanged<String> onText;
  final VoidCallback onFailed;

  @override
  ConsumerState<Viewfinder> createState() => _ViewfinderState();
}

class _ViewfinderState extends ConsumerState<Viewfinder> {
  late final QrScanner _scanner = ref.read(qrScannerProvider);
  StreamSubscription<String>? _texts;
  ScannerView? _view;
  var _gone = false;

  @override
  void initState() {
    super.initState();
    _texts = _scanner.codes.listen((text) => widget.onText(text));
    unawaited(_start());
  }

  Future<void> _start() async {
    try {
      final view = await _scanner.start();
      if (_gone) return unawaited(_scanner.stop());
      setState(() => _view = view);
    } on PlatformException {
      if (!_gone) widget.onFailed();
    }
  }

  @override
  void dispose() {
    _gone = true;
    unawaited(_texts?.cancel());
    unawaited(_scanner.stop());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    if (view == null) return const SizedBox.shrink();
    Widget picture = SizedBox(
      width: view.width.toDouble(),
      height: view.height.toDouble(),
      child: Texture(textureId: view.textureId),
    );
    if (view.mirrored) picture = Transform.flip(flipX: true, child: picture);
    return FittedBox(
      fit: BoxFit.cover,
      clipBehavior: Clip.hardEdge,
      child: RotatedBox(quarterTurns: view.quarterTurns, child: picture),
    );
  }
}

/// Where checking a code stands.
sealed class _Approval {
  const _Approval();
}

final class _Checking extends _Approval {
  const _Checking();
}

final class _Waiting extends _Approval {
  const _Waiting(this.request);

  final DeviceRequest request;
}

final class _Approved extends _Approval {
  const _Approved(this.request);

  final DeviceRequest request;
}

/// It expired, was used, or never was: on this server, at least.
final class _Gone extends _Approval {
  const _Gone();
}

final class _Failed extends _Approval {
  const _Failed(this.error);

  final Object error;
}

/// The device [userCode] belongs to, for the person to check, and approving
/// it. [from] is the server the QR code named, to say so when it isn't this
/// one. [typed] when the person typed the code rather than scanned it.
class ApproveStep extends ConsumerStatefulWidget {
  const ApproveStep({
    super.key,
    required this.userCode,
    required this.from,
    required this.typed,
    required this.onAgain,
  });

  final String userCode;
  final String? from;
  final bool typed;
  final VoidCallback onAgain;

  @override
  ConsumerState<ApproveStep> createState() => _ApproveStepState();
}

class _ApproveStepState extends ConsumerState<ApproveStep> {
  _Approval _state = const _Checking();
  var _approving = false;
  Object? _approveError;

  @override
  void initState() {
    super.initState();
    unawaited(_look());
  }

  MatineeApi _api() => ref.read(apiProvider) ?? (throw const NotConnected());

  Future<void> _look() async {
    setState(() => _state = const _Checking());
    _Approval next;
    try {
      next = _Waiting(await _api().auth.device.get(widget.userCode));
    } on ApiException catch (error) {
      next = error.status == 404 ? const _Gone() : _Failed(error);
    } on Object catch (error) {
      next = _Failed(error);
    }
    if (mounted) setState(() => _state = next);
  }

  Future<void> _approve(DeviceRequest request) async {
    if (_approving) return;
    setState(() {
      _approving = true;
      _approveError = null;
    });
    _Approval? next;
    Object? failure;
    try {
      await _api().auth.device.approve(widget.userCode);
      next = _Approved(request);
    } on ApiException catch (error) {
      if (error.status == 404) {
        next = const _Gone();
      } else {
        failure = error;
      }
    } on Object catch (error) {
      failure = error;
    }
    if (!mounted) return;
    setState(() {
      _approving = false;
      _approveError = failure;
      if (next != null) _state = next;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final auth = ref.watch(authStateProvider);
    final (server, name) = switch (auth) {
      SignedIn(:final server, :final user) => (server, user.name),
      _ => (null, ''),
    };
    final again = widget.typed ? l.linkAgainTyped : l.linkAgain;
    final muted = KitText.sm.style(color: colors.mutedForeground);
    final small = KitText.px13.style(color: colors.mutedForeground);
    return switch (_state) {
      _Checking() => SizedBox(
        height: 160,
        child: Center(child: Spinner(size: 32, color: colors.accent)),
      ),
      _Waiting(:final request) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DeviceCard(request: request),
          const SizedBox(height: 20),
          Text.rich(
            _emphasized(
              l.linkWants(name),
              name,
              const TextStyle(fontWeight: FontWeight.w600),
            ),
            style: KitText.base.style(color: colors.foreground),
          ),
          const SizedBox(height: 6),
          Text.rich(
            _emphasized(
              l.linkCodeShown(request.userCode),
              request.userCode,
              TextStyle(
                fontFamily: 'monospace',
                fontWeight: FontWeight.w500,
                color: colors.foreground,
              ),
            ),
            style: muted,
          ),
          const SizedBox(height: 24),
          MatineeButton(
            onPressed: _approving ? null : () => _approve(request),
            leading: _approving ? null : Lucide.check,
            child: _approving
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    spacing: 8,
                    children: [
                      Spinner(size: 18, color: colors.accentForeground),
                      Text(l.linkApprove),
                    ],
                  )
                : Text(l.linkApprove),
          ),
          if (_approveError case final error?) ...[
            const SizedBox(height: 10),
            Text(
              l.linkApproveFailed(describeFailure(l, error)),
              style: KitText.px13.style(color: colors.danger),
            ),
          ],
          const SizedBox(height: 10),
          MatineeButton(
            onPressed: widget.onAgain,
            look: ButtonLook.ghost,
            child: Text(l.commonCancel),
          ),
          const SizedBox(height: 20),
          Text(l.linkWarning, style: small),
        ],
      ),
      _Approved(:final request) => _Outcome(
        icon: Lucide.circleCheck,
        tint: colors.accent,
        title: l.linkSignedIn,
        description: l.linkSignedInDescription(deviceLabel(request, l), name),
        actions: [
          MatineeButton(
            onPressed: () => context.pop(),
            child: Text(l.linkDone),
          ),
        ],
      ),
      _Gone() => _Outcome(
        icon: Lucide.circleAlert,
        tint: colors.mutedForeground,
        title: l.linkCodeGone,
        description: l.linkCodeGoneDescription,
        detail: switch ((widget.from, server)) {
          (final from?, final server?) when from != server => l.linkOtherServer(
            from,
            server,
          ),
          _ => null,
        },
        actions: [
          MatineeButton(
            onPressed: widget.onAgain,
            look: ButtonLook.outline,
            child: Text(again),
          ),
        ],
      ),
      _Failed(:final error) => _Outcome(
        icon: Lucide.circleAlert,
        tint: colors.mutedForeground,
        title: l.linkLookupFailed,
        description: describeFailure(l, error),
        actions: [
          MatineeButton(
            onPressed: _look,
            look: ButtonLook.outline,
            child: Text(l.commonRetry),
          ),
          const SizedBox(height: 10),
          MatineeButton(
            onPressed: widget.onAgain,
            look: ButtonLook.ghost,
            child: Text(again),
          ),
        ],
      ),
    };
  }
}

/// [text] with [part], a value put into a message, in [style].
TextSpan _emphasized(String text, String part, TextStyle style) {
  final at = part.isEmpty ? -1 : text.indexOf(part);
  if (at < 0) return TextSpan(text: text);
  return TextSpan(
    children: [
      TextSpan(text: text.substring(0, at)),
      TextSpan(text: part, style: style),
      TextSpan(text: text.substring(at + part.length)),
    ],
  );
}

/// An app's device by its name, or by what it runs on: `Android TV app`.
String deviceLabel(DeviceRequest request, AppLocalizations l) =>
    request.deviceName ?? l.accountDeviceApp(platformLabel(request.platform));

/// The device a code belongs to, as the web's `DeviceCard`.
class DeviceCard extends StatelessWidget {
  const DeviceCard({super.key, required this.request});

  final DeviceRequest request;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: KitRadius.panel,
        border: Border.all(color: colors.border),
      ),
      child: Row(
        spacing: 14,
        children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: colors.secondary,
              borderRadius: const BorderRadius.all(Radius.circular(10)),
            ),
            child: KitIcon(
              platformIcon(request.platform),
              color: colors.mutedForeground,
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  deviceLabel(request, l),
                  style: KitText.base.style(
                    color: colors.foreground,
                    weight: FontWeight.w500,
                  ),
                ),
                Text(
                  platformLabel(request.platform),
                  style: KitText.px13.style(color: colors.mutedForeground),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// How checking a code ended, with what to do next.
class _Outcome extends StatelessWidget {
  const _Outcome({
    required this.icon,
    required this.tint,
    required this.title,
    required this.description,
    this.detail,
    required this.actions,
  });

  final String icon;
  final Color tint;
  final String title;
  final String description;
  final String? detail;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final muted = KitText.sm.style(color: colors.mutedForeground);
    final detail = this.detail;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 24),
        KitIcon(icon, size: 36, color: tint),
        const SizedBox(height: 16),
        Text(
          title,
          style: KitText.px22
              .style(color: colors.foreground, weight: FontWeight.w600)
              .copyWith(letterSpacing: KitText.px22.size * -.025),
        ),
        const SizedBox(height: 8),
        Text(description, style: muted),
        if (detail != null) ...[
          const SizedBox(height: 8),
          Text(detail, style: muted),
        ],
        const SizedBox(height: 28),
        SizedBox(
          width: double.infinity,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: actions,
          ),
        ),
      ],
    );
  }
}
