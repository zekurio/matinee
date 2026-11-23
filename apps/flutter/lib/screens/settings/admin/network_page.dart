import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show NumberFormat;

import '../../../api/matinee_api.dart';
import '../../../core/session.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../query/server_data.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

class NetworkPage extends ConsumerWidget {
  const NetworkPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final data = ref.watch(networkProvider);
    if (data.asData case final loaded?) {
      return _NetworkForm(key: ObjectKey(loaded.value), initial: loaded.value);
    }
    return AdminPage(
      title: l.settingsAdminNetwork,
      child: data.isLoading
          ? LoadingState(label: l.adminLoading)
          : adminBody(
              context,
              data,
              onRetry: () => ref.invalidate(networkProvider),
              loaded: (_) => const SizedBox(),
            ),
    );
  }
}

const _bitsPerMegabit = 1000000;
typedef _Draft = ({String localNetworks, String trustedProxies, String upload});

List<String> _ranges(String text) =>
    text.split(RegExp(r'[\s,]+')).where((range) => range.isNotEmpty).toList();

class _NetworkForm extends ConsumerStatefulWidget {
  const _NetworkForm({super.key, required this.initial});

  final AdminNetworkSettings initial;

  @override
  ConsumerState<_NetworkForm> createState() => _NetworkFormState();
}

class _NetworkFormState extends ConsumerState<_NetworkForm> {
  late var _saved = widget.initial;
  late var _original = _draftFrom(_saved.settings);
  late var _draft = _original;

  void _edit({String? localNetworks, String? trustedProxies, String? upload}) {
    setState(() {
      _draft = (
        localNetworks: localNetworks ?? _draft.localNetworks,
        trustedProxies: trustedProxies ?? _draft.trustedProxies,
        upload: upload ?? _draft.upload,
      );
    });
  }

  _Draft _draftFrom(NetworkSettings settings) {
    final l = AppLocalizations.of(context);
    final bitrate = settings.uploadBitrate;
    return (
      localNetworks: settings.localNetworks.join('\n'),
      trustedProxies: settings.trustedProxies.join('\n'),
      upload: bitrate == null
          ? ''
          : NumberFormat(
              '0.######',
              l.localeName,
            ).format(bitrate / _bitsPerMegabit),
    );
  }

  Future<void> _save(int? bitrate) async {
    final api = ref.read(apiProvider) ?? (throw const NotConnected());
    final sent = _draft;
    final saved = await api.admin.network.update(
      NetworkSettings(
        localNetworks: _ranges(sent.localNetworks),
        trustedProxies: _ranges(sent.trustedProxies),
        uploadBitrate: bitrate,
      ),
    );
    if (!mounted) return;

    final next = _draftFrom(saved.settings);
    setState(() {
      _saved = saved;
      _original = next;
      // Keep edits made while the save was in flight.
      _draft = (
        localNetworks: _draft.localNetworks == sent.localNetworks
            ? next.localNetworks
            : _draft.localNetworks,
        trustedProxies: _draft.trustedProxies == sent.trustedProxies
            ? next.trustedProxies
            : _draft.trustedProxies,
        upload: _draft.upload == sent.upload ? next.upload : _draft.upload,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final connection = _saved.connection;
    final address = connection.address;
    final upload = _draft.upload.trim();
    final bits =
        (double.tryParse(upload.replaceAll(',', '.')) ?? double.nan) *
        _bitsPerMegabit;
    final invalidUpload = upload.isNotEmpty && !bits.isFinite;
    return SaveBarPage(
      title: l.settingsAdminNetwork,
      dirty: _draft != _original,
      canSave: !invalidUpload,
      onReset: () => setState(() => _draft = _original),
      onSave: () => _save(upload.isEmpty ? null : bits.round()),
      child: AdminSections(
        sections: [
          SettingsSection(
            title: l.webNetworkTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                Note(switch (address) {
                  null => l.webNetworkConnectionUnknown,
                  _ when connection.local => l.webNetworkConnectionLocal(
                    address,
                  ),
                  _ => l.webNetworkConnectionRemote(address),
                }),
                if (connection.unheededProxy && address != null)
                  Note(l.webNetworkUnheededProxy(address), danger: true),
                Panel(
                  rows: [
                    TextRow(
                      label: l.webNetworkLocalNetworks,
                      value: _draft.localNetworks,
                      hint: l.webNetworkRangesNote,
                      maxLines: 8,
                      onChanged: (value) => _edit(localNetworks: value),
                    ),
                    TextRow(
                      label: l.webNetworkTrustedProxies,
                      value: _draft.trustedProxies,
                      hint: l.webNetworkTrustedProxiesNote,
                      maxLines: 4,
                      onChanged: (value) => _edit(trustedProxies: value),
                    ),
                  ],
                ),
              ],
            ),
          ),
          SettingsSection(
            title: l.webNetworkUploadTitle,
            child: Panel(
              rows: [
                TextRow(
                  label: l.webNetworkUpload,
                  value: _draft.upload,
                  placeholder: l.webNetworkUploadPlaceholder,
                  hint: l.webNetworkUploadNote,
                  error: invalidUpload ? l.adminEnterNumber : null,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  onChanged: (value) => _edit(upload: value),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
