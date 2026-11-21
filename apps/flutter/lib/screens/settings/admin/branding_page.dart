import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/matinee_api.dart';
import '../../../core/field_errors.dart';
import '../../../core/server_accents.dart';
import '../../../core/session.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// The theme's own accents, which the server stores as null.
String _hex(Color color) =>
    '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
final _defaultLight = _hex(matineeLight.accent);
final _defaultDark = _hex(matineeDark.accent);

/// Starting points, Matinee's own first, a shade per appearance, as the
/// web and the Kotlin app offer them.
List<(String, String)> get _presets => [
  (_defaultLight, _defaultDark),
  ('#0369a1', '#38bdf8'),
  ('#0f766e', '#2dd4bf'),
  ('#13793a', '#4ade80'),
  ('#975c06', '#facc15'),
  ('#bb3e0b', '#fb923c'),
  ('#be123c', '#f43f5e'),
  ('#be185d', '#ec4899'),
];

/// What the server stores for [text]: null for the theme's own accent.
String? _stored(String text, String fallback) {
  final value = text.trim().toLowerCase();
  return value == fallback ? null : value;
}

/// The color a full `#rrggbb` names, for its dot beside the field; null
/// while it's anything else. Whether it's a color the server takes, it
/// says on a save.
Color? _shown(String text) {
  final match = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(text.trim());
  if (match == null) return null;
  return Color(0xFF000000 | int.parse(match.group(1)!, radix: 16));
}

/// The accent the Matinee theme uses for everyone on the server, as the
/// Kotlin app's `ServerBrandingSettings` and the web's branding panel: a
/// preset, or a color per appearance, saved from the save bar. The login
/// screen's artwork is set on the web, so a save keeps it as it was.
class BrandingPage extends ConsumerWidget {
  const BrandingPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final data = ref.watch(brandingProvider);
    final saved = data.value;
    if (saved == null) {
      return AdminPage(
        title: l.settingsAdminBranding,
        child: adminBody(
          context,
          data,
          onRetry: () => ref.invalidate(brandingProvider),
          loaded: (_) => const SizedBox(),
        ),
      );
    }
    return _BrandingForm(key: ObjectKey(saved), saved: saved);
  }
}

class _BrandingForm extends ConsumerStatefulWidget {
  const _BrandingForm({super.key, required this.saved});

  final Branding saved;

  @override
  ConsumerState<_BrandingForm> createState() => _BrandingFormState();
}

class _BrandingFormState extends ConsumerState<_BrandingForm> {
  late String _light = widget.saved.themeAccents.light ?? _defaultLight;
  late String _dark = widget.saved.themeAccents.dark ?? _defaultDark;
  Map<String, String> _errors = const {};

  /// Where the app shows the accents being edited, before they're saved,
  /// as the web's branding panel previews them on the whole page.
  late final AccentPreview _preview;

  @override
  void initState() {
    super.initState();
    _preview = ref.read(accentPreviewProvider.notifier);
  }

  @override
  void dispose() {
    // Leaving takes the preview off, back to the server's accents. Not
    // while the tree is being torn down, which mustn't change a provider.
    final preview = _preview;
    unawaited(Future.microtask(() => preview.show(null)));
    super.dispose();
  }

  /// [change] applied, then the app's colours following the draft, or
  /// the server's again once it matches them.
  void _edit(VoidCallback change) {
    setState(change);
    _preview.show(_dirty ? _draft : null);
  }

  ThemeAccents get _draft => ThemeAccents(
    light: _stored(_light, _defaultLight),
    dark: _stored(_dark, _defaultDark),
  );

  bool get _dirty {
    final saved = widget.saved.themeAccents;
    return _draft.light != saved.light || _draft.dark != saved.dark;
  }

  Future<void> _save() async {
    final api = ref.read(apiProvider);
    if (api == null) return;
    setState(() => _errors = const {});
    try {
      await api.admin.branding.update(
        Branding(
          themeAccents: _draft,
          loginBackdrop: widget.saved.loginBackdrop,
        ),
      );
    } on Object catch (error) {
      if (mounted) setState(() => _errors = fieldErrors(error));
      rethrow;
    }
    if (!mounted) return;
    // The server's accents are these now: the app keeps them once the
    // preview goes.
    await ref.read(serverAccentsProvider.notifier).refresh();
    _preview.show(null);
    if (mounted) ref.invalidate(brandingProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final presets = _presets;
    return SaveBarPage(
      title: l.settingsAdminBranding,
      dirty: _dirty,
      onReset: () => _edit(() {
        _light = widget.saved.themeAccents.light ?? _defaultLight;
        _dark = widget.saved.themeAccents.dark ?? _defaultDark;
        _errors = const {};
      }),
      onSave: _save,
      child: AdminSections(
        bottom: !_dirty,
        sections: [
          SettingsSection(
            title: l.webBrandingTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 16,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final (index, (light, dark)) in presets.indexed)
                      _Swatch(
                        light: light,
                        dark: dark,
                        name: index == 0
                            ? l.webBrandingDefault
                            : '$light / $dark',
                        selected:
                            _light.trim().toLowerCase() == light &&
                            _dark.trim().toLowerCase() == dark,
                        onPressed: () => _edit(() {
                          _light = light;
                          _dark = dark;
                          _errors = const {};
                        }),
                      ),
                  ],
                ),
                Panel(
                  rows: [
                    _ColorRow(
                      label: l.webBrandingModeLight,
                      value: _light,
                      error: _errors['themeAccents.light'],
                      onChanged: (value) => _edit(() {
                        _light = value;
                        _errors = {..._errors}..remove('themeAccents.light');
                      }),
                    ),
                    _ColorRow(
                      label: l.webBrandingModeDark,
                      value: _dark,
                      error: _errors['themeAccents.dark'],
                      onChanged: (value) => _edit(() {
                        _dark = value;
                        _errors = {..._errors}..remove('themeAccents.dark');
                      }),
                    ),
                  ],
                ),
                for (final MapEntry(:key, :value) in _errors.entries)
                  if (key != 'themeAccents.light' && key != 'themeAccents.dark')
                    Note(value, danger: true),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A preset: the light accent and the dark one, split on a diagonal,
/// ringed when picked.
class _Swatch extends StatelessWidget {
  const _Swatch({
    required this.light,
    required this.dark,
    required this.name,
    required this.selected,
    required this.onPressed,
  });

  final String light;
  final String dark;
  final String name;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Semantics(
      selected: selected,
      child: PressIndication(
        onPressed: onPressed,
        label: name,
        builder: (context, state) => Container(
          width: 40,
          height: 40,
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              width: 2,
              color: selected
                  ? colors.foreground
                  : colors.foreground.withValues(
                      alpha: state == PressState.idle ? 0 : .2,
                    ),
            ),
          ),
          child: ClipOval(
            child: CustomPaint(
              painter: _SplitPainter(
                light: _shown(light) ?? colors.accent,
                dark: _shown(dark) ?? colors.accent,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SplitPainter extends CustomPainter {
  const _SplitPainter({required this.light, required this.dark});

  final Color light;
  final Color dark;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = dark);
    canvas.drawPath(
      Path()
        ..moveTo(0, 0)
        ..lineTo(size.width, 0)
        ..lineTo(0, size.height)
        ..close(),
      Paint()..color = light,
    );
  }

  @override
  bool shouldRepaint(_SplitPainter old) =>
      old.light != light || old.dark != dark;
}

/// A mode's accent: its hex value, with a dot of the color it names.
class _ColorRow extends StatelessWidget {
  const _ColorRow({
    required this.label,
    required this.value,
    required this.error,
    required this.onChanged,
  });

  final String label;
  final String value;
  final String? error;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final shown = _shown(value);
    return TextRow(
      label: label,
      value: value,
      placeholder: '#rrggbb',
      error: error,
      onChanged: onChanged,
      trailing: Padding(
        padding: const EdgeInsetsDirectional.only(end: 12),
        child: Container(
          width: 22,
          height: 22,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: shown,
            border: Border.all(color: colors.foreground.withValues(alpha: .15)),
          ),
        ),
      ),
    );
  }
}
