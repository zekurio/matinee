import 'dart:async';

import 'package:flutter/foundation.dart' show mapEquals, setEquals;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/matinee_api.dart';
import '../../../core/failure_text.dart';
import '../../../core/field_errors.dart';
import '../../../core/permissions.dart';
import '../../../core/session.dart';
import '../../../core/toasts.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../query/failure_view.dart';
import '../../../router.dart';
import '../settings_rows.dart';
import 'access_parts.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// A group as the server has it.
typedef _AccessGroup = AdminGroupsListOutput;

/// The access groups, as the web's access panel: Everyone first, then the
/// others, each with its members and what it allows. A tap offers editing
/// it and deleting it, which asks first, each only as the account's
/// permissions allow; Everyone can't be deleted. New group opens the
/// editor empty. The server refuses a group that grants what its maker
/// lacks, and its word shows where the save was asked for.
class AccessGroupsPage extends ConsumerWidget {
  const AccessGroupsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final groups = ref.watch(adminGroupsProvider);
    final libraries = ref.watch(adminLibrariesProvider).value ?? const [];
    final create = ref.watch(canProvider(Permission.groupCreate));
    final may = (
      edit: ref.watch(canProvider(Permission.groupUpdate)),
      delete: ref.watch(canProvider(Permission.groupDelete)),
    );
    final words = AccessWords(l, libraries);
    return AdminPage(
      title: l.settingsAdminAccess,
      child: adminBody(
        context,
        groups,
        onRetry: () => ref.invalidate(adminGroupsProvider),
        loaded: (list) => AdminSections(
          sections: [
            SettingsSection(
              title: l.webAccessGroupsTitle,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 8,
                children: [
                  Note(l.webAccessGroupsIntro),
                  Panel(
                    rows: [
                      for (final group in list)
                        _GroupRow(
                          key: ValueKey(group.id),
                          group: group,
                          words: words,
                          onPressed: may.edit || (may.delete && !group.everyone)
                              ? () => unawaited(_act(context, ref, group, may))
                              : null,
                        ),
                    ],
                  ),
                  if (list.length == 1) Note(l.webAccessGroupsOnlyEveryone),
                ],
              ),
            ),
            if (create)
              MatineeButton(
                leading: Lucide.plus,
                onPressed: () => unawaited(_edit(context, ref)),
                child: Text(l.webAccessGroupsCreate),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _act(
    BuildContext context,
    WidgetRef ref,
    _AccessGroup group,
    ({bool edit, bool delete}) may,
  ) {
    final l = AppLocalizations.of(context);
    return pickFrom(
      context,
      title: _groupName(l, group),
      items: [
        if (may.edit)
          (
            Lucide.settings,
            l.webAccessGroupEdit,
            () => unawaited(_edit(context, ref, group.id)),
            false,
          ),
        if (may.delete && !group.everyone)
          (
            Lucide.trash,
            l.webAccessGroupDelete,
            () => unawaited(_delete(context, ref, group)),
            true,
          ),
      ],
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, [String? id]) async {
    await context.push<void>(Routes.accessGroup(id));
    if (context.mounted) ref.invalidate(adminGroupsProvider);
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    _AccessGroup group,
  ) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    final yes = await ConfirmDialog.show(
      context,
      title: l.webAccessGroupDeleteTitle(group.name),
      description: group.members > 0
          ? l.webAccessGroupDeleteDescription(group.members)
          : l.webAccessGroupDeleteDescriptionEmpty,
      confirmLabel: l.webAccessGroupDelete,
      cancelLabel: l.commonCancel,
      destructive: true,
    );
    if (!yes || api == null || !context.mounted) return;
    final deleted = await runAction(
      ref,
      l,
      () => api.admin.groups.remove(group.id),
      failure: l.adminGroupDeleteFailed(group.name),
    );
    if (!context.mounted) return;
    if (deleted) {
      _invalidateNamers(ref);
      unawaited(
        ref
            .read(toastProvider)
            .show(l.webAccessGroupDeleted(group.name), kind: ToastKind.success),
      );
    }
  }
}

/// The group's name, or the app's word for the built-in one.
String _groupName(AppLocalizations l, _AccessGroup group) =>
    group.everyone ? l.webAccessEveryone : group.name;

/// Groups count their members, and accounts and invites name their groups.
void _invalidateNamers(WidgetRef ref) => ref
  ..invalidate(adminGroupsProvider)
  ..invalidate(adminUsersProvider)
  ..invalidate(adminInvitesProvider);

/// A group: its name and members, the provider group it follows, and what
/// it allows, as the web's list shows them.
class _GroupRow extends StatelessWidget {
  const _GroupRow({
    super.key,
    required this.group,
    required this.words,
    required this.onPressed,
  });

  final _AccessGroup group;
  final AccessWords words;

  /// Null for an account that may do nothing to it.
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final name = _groupName(l, group);
    final policy = group.policy;
    final lines = [
      if (group.providerGroup case final provider?)
        l.webAccessGroupFollows(provider),
      [
        words.libraries(policy.libraries.all, policy.libraries.ids),
        words.bitrate(policy.maxBitrate),
        policy.transcode ? l.webAccessTranscodeOn : l.webAccessTranscodeOff,
        policy.downloads ? l.webAccessDownloadsOn : l.webAccessDownloadsOff,
        words.streams(policy.maxStreams),
        words.requestsFact(policy.requests, policy.requestLimit),
        if (policy.apiTokens) l.webAccessApiTokensOn,
        ?words.manages(policy.manages, admin: false)?.label,
      ].join(' · '),
    ];
    return PressIndication(
      onPressed: onPressed,
      label: l.webAccessGroupActions(name),
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              spacing: 14,
              children: [
                KitIcon(
                  group.everyone ? Lucide.globe : Lucide.users,
                  size: 20,
                  color: colors.mutedForeground,
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(text: name),
                            TextSpan(
                              text:
                                  '  ${group.everyone ? l.webAccessGroupEveryAccount : l.webAccessGroupMembers(group.members)}',
                              style: KitText.sm.style(
                                color: colors.mutedForeground,
                              ),
                            ),
                          ],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.base.style(color: colors.foreground),
                      ),
                      for (final line in lines)
                        Text(
                          line,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.sm.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A group's settings as the form holds them. Limits are null for none.
@immutable
final class _Draft {
  const _Draft({
    required this.name,
    required this.providerGroup,
    required this.allLibraries,
    required this.libraryIds,
    required this.maxBitrate,
    required this.transcode,
    required this.maxStreams,
    required this.downloads,
    required this.requests,
    required this.requestLimit,
    required this.apiTokens,
    required this.manages,
  });

  /// A new group opens every library and limits nothing, as Everyone
  /// starts, and lets members download and nothing else. Downloading
  /// starts off for an editor who can't grant it, as on the web, since the
  /// server would refuse the group.
  factory _Draft.of(_AccessGroup? group, {required bool mayDownload}) {
    final policy = group?.policy;
    final manages = policy?.manages;
    return _Draft(
      name: group?.name ?? '',
      providerGroup: group?.providerGroup ?? '',
      allLibraries: policy?.libraries.all ?? true,
      libraryIds: {...?policy?.libraries.ids},
      maxBitrate: policy?.maxBitrate,
      transcode: policy?.transcode ?? true,
      maxStreams: policy?.maxStreams,
      downloads: policy?.downloads ?? mayDownload,
      requests: policy?.requests ?? RequestMode.off,
      requestLimit: policy?.requestLimit,
      apiTokens: policy?.apiTokens ?? false,
      manages: {
        for (final area in managedAreas.keys)
          area: manages == null ? AccessLevel.none : levelIn(manages, area),
      },
    );
  }

  final String name;
  final String providerGroup;
  final bool allLibraries;
  final Set<String> libraryIds;
  final int? maxBitrate;
  final bool transcode;
  final int? maxStreams;
  final bool downloads;

  /// A [RequestMode].
  final String requests;
  final RequestQuota? requestLimit;
  final bool apiTokens;

  /// Each area's level.
  final Map<String, String> manages;

  _Draft copy({
    String? name,
    String? providerGroup,
    bool? allLibraries,
    Set<String>? libraryIds,
    int? Function()? maxBitrate,
    bool? transcode,
    int? Function()? maxStreams,
    bool? downloads,
    String? requests,
    RequestQuota? Function()? requestLimit,
    bool? apiTokens,
    Map<String, String>? manages,
  }) => _Draft(
    name: name ?? this.name,
    providerGroup: providerGroup ?? this.providerGroup,
    allLibraries: allLibraries ?? this.allLibraries,
    libraryIds: libraryIds ?? this.libraryIds,
    maxBitrate: maxBitrate == null ? this.maxBitrate : maxBitrate(),
    transcode: transcode ?? this.transcode,
    maxStreams: maxStreams == null ? this.maxStreams : maxStreams(),
    downloads: downloads ?? this.downloads,
    requests: requests ?? this.requests,
    requestLimit: requestLimit == null ? this.requestLimit : requestLimit(),
    apiTokens: apiTokens ?? this.apiTokens,
    manages: manages ?? this.manages,
  );

  AccessPolicy policy() => AccessPolicy(
    libraries: AccessPolicyLibraries(
      all: allLibraries,
      ids: allLibraries ? const [] : libraryIds.toList(),
    ),
    maxBitrate: maxBitrate,
    transcode: transcode,
    maxStreams: maxStreams,
    downloads: downloads,
    requests: requests,
    requestLimit: requests == RequestMode.off ? null : requestLimit,
    apiTokens: apiTokens,
    manages: ManagedAccess(
      requests: manages['requests']!,
      connections: manages['connections']!,
      libraries: manages['libraries']!,
      metadata: manages['metadata']!,
      users: manages['users']!,
      server: manages['server']!,
    ),
  );

  @override
  bool operator ==(Object other) =>
      other is _Draft &&
      name == other.name &&
      providerGroup == other.providerGroup &&
      allLibraries == other.allLibraries &&
      (allLibraries || setEquals(libraryIds, other.libraryIds)) &&
      maxBitrate == other.maxBitrate &&
      transcode == other.transcode &&
      maxStreams == other.maxStreams &&
      downloads == other.downloads &&
      requests == other.requests &&
      (requests == RequestMode.off ||
          (requestLimit?.titles == other.requestLimit?.titles &&
              requestLimit?.days == other.requestLimit?.days)) &&
      apiTokens == other.apiTokens &&
      mapEquals(manages, other.manages);

  @override
  int get hashCode => Object.hash(name, transcode, requests);
}

/// One group's page, as the web's group dialog: a new group, or with [id]
/// one to change. A new one is made with Create group; one that exists
/// saves from the save bar. Everyone keeps its name and has no provider
/// group, so only its policy shows.
class AccessGroupPage extends ConsumerWidget {
  const AccessGroupPage({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final groups = ref.watch(adminGroupsProvider);
    bool allows(User user) =>
        can(user, id == null ? Permission.groupCreate : Permission.groupUpdate);
    if (id == null) {
      return AdminGate(allows: allows, child: const _GroupForm(group: null));
    }
    _AccessGroup? group;
    for (final entry in groups.value ?? const <_AccessGroup>[]) {
      if (entry.id == id) group = entry;
    }
    if (group == null) {
      return AdminGate(
        allows: allows,
        child: AdminPage(
          title: l.webAccessGroupsTitle,
          child: groups.isLoading
              ? LoadingState(label: l.adminLoading)
              : Center(
                  child: FailureState(
                    title: l.adminLoadFailed,
                    error: groups.error ?? const ApiException(status: 404),
                    onRetry: () => ref.invalidate(adminGroupsProvider),
                  ),
                ),
        ),
      );
    }
    return AdminGate(
      allows: allows,
      child: _GroupForm(key: ValueKey(group.id), group: group),
    );
  }
}

class _GroupForm extends ConsumerStatefulWidget {
  const _GroupForm({super.key, required this.group});

  /// Null for a new group.
  final _AccessGroup? group;

  @override
  ConsumerState<_GroupForm> createState() => _GroupFormState();
}

class _GroupFormState extends ConsumerState<_GroupForm> {
  late var _saved = _Draft.of(
    widget.group,
    mayDownload: ref.read(canProvider(Permission.mediaDownload)),
  );
  late var _draft = _saved;
  Map<String, String> _errors = const {};

  /// What no field shows of a failed create; a save's shows in its bar.
  String? _failure;
  bool _creating = false;

  /// A save brings the group back as the server has it, and the form
  /// starts again from there.
  @override
  void didUpdateWidget(_GroupForm old) {
    super.didUpdateWidget(old);
    final group = widget.group;
    if (group == null) return;
    final saved = _Draft.of(group, mayDownload: false);
    if (saved == _saved) return;
    _saved = saved;
    _restart();
  }

  void _restart() {
    _draft = _saved;
    _errors = const {};
  }

  void _edit(_Draft draft) => setState(() => _draft = draft);

  bool get _everyone => widget.group?.everyone ?? false;

  /// What's sent: the server keeps Everyone's name and provider group.
  ({String name, String? providerGroup, AccessPolicy policy}) _input() {
    final group = widget.group;
    final provider = _draft.providerGroup.trim();
    return (
      name: _everyone && group != null ? group.name : _draft.name,
      providerGroup: _everyone || provider.isEmpty ? null : provider,
      policy: _draft.policy(),
    );
  }

  Future<void> _save() async {
    final api = ref.read(apiProvider);
    final group = widget.group;
    if (api == null || group == null) return;
    final provider = _draft.providerGroup.trim();
    setState(() {
      _errors = const {};
      // What's sent is trimmed, so the field shows what went.
      _draft = _draft.copy(providerGroup: provider);
    });
    final input = _input();
    try {
      await api.admin.groups.update(
        group.id,
        name: input.name,
        providerGroup: input.providerGroup,
        policy: input.policy,
      );
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _errors = fieldErrors(AppLocalizations.of(context), error),
        );
      }
      rethrow;
    }
    if (!mounted) return;
    ref
      ..invalidate(adminUsersProvider)
      ..invalidate(adminInvitesProvider);
    await reread(ref, adminGroupsProvider.future);
  }

  Future<void> _create() async {
    final api = ref.read(apiProvider);
    if (api == null || _creating) return;
    final l = AppLocalizations.of(context);
    setState(() {
      _creating = true;
      _errors = const {};
      _failure = null;
    });
    final input = _input();
    try {
      await api.admin.groups.create(
        name: input.name,
        providerGroup: input.providerGroup,
        policy: input.policy,
      );
      _invalidateNamers(ref);
      if (mounted) context.pop();
    } on Object catch (error) {
      if (!mounted) return;
      final errors = fieldErrors(l, error);
      setState(() {
        _creating = false;
        _errors = errors;
        // What no field shows, the page does.
        _failure = errors.isEmpty ? describeFailure(l, error) : null;
      });
    }
  }

  String? _error(String field) {
    for (final MapEntry(:key, :value) in _errors.entries) {
      if (_namesField(key, field)) return value;
    }
    return null;
  }

  static bool _namesField(String path, String field) =>
      path == field || path.contains('$field.') || path.endsWith(field);

  /// The server's words for settings the form has no row of its own for,
  /// like a policy's numbers.
  List<String> get _unshownErrors => [
    for (final MapEntry(:key, :value) in _errors.entries)
      if (![
        'name',
        'providerGroup',
        'requestLimit',
      ].any((field) => _namesField(key, field)))
        value,
  ];

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final group = widget.group;
    final libraries = ref.watch(adminLibrariesProvider).value ?? const [];
    final qualities = ref.watch(qualitiesProvider).value?.qualities ?? const [];
    final providerGroups = ref.watch(adminProviderGroupsProvider).value;
    final words = AccessWords(l, libraries);
    final draft = _draft;
    final everyone = _everyone;
    final bitrates = {
      for (final quality in qualities) quality.bitrate,
      ?draft.maxBitrate,
    }.toList()..sort((a, b) => b.compareTo(a));
    final streams = {...streamChoices, ?draft.maxStreams}.toList()..sort();
    final quota = draft.requestLimit;
    final failure = _failure;
    final unshown = _unshownErrors;

    final sections = [
      if (failure != null) Note(failure, danger: true),
      for (final error in unshown) Note(error, danger: true),
      Note(
        everyone
            ? l.webAccessGroupEveryoneDescription
            : l.webAccessGroupDescription,
      ),
      if (!everyone)
        Panel(
          rows: [
            TextRow(
              label: l.webAccessGroupName,
              value: draft.name,
              placeholder: l.webAccessGroupNamePlaceholder,
              error: _error('name'),
              onChanged: (value) => _edit(draft.copy(name: value)),
            ),
            TextRow(
              label: l.webAccessGroupProviderGroup,
              value: draft.providerGroup,
              placeholder: l.webAccessGroupProviderGroupPlaceholder,
              error: _error('providerGroup'),
              hint: providerGroups?.isEmpty ?? false
                  ? l.webAccessGroupProviderGroupHintNoClaim
                  : l.webAccessGroupProviderGroupHint,
              onChanged: (value) => _edit(draft.copy(providerGroup: value)),
            ),
          ],
        ),
      SettingsSection(
        title: l.webAccessSectionWatching,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            Panel(
              rows: [
                PickerRow<bool>(
                  title: l.adminAccessLibraries,
                  options: [
                    (true, l.adminAccessLibrariesAll),
                    (false, l.adminAccessLibrariesPicked),
                  ],
                  current: draft.allLibraries,
                  onPicked: (all) => _edit(draft.copy(allLibraries: all)),
                ),
                if (!draft.allLibraries)
                  for (final library in libraries)
                    SwitchRow(
                      icon: library.kind == LibraryKind.shows
                          ? Lucide.tv
                          : Lucide.film,
                      title: library.name,
                      checked: draft.libraryIds.contains(library.id),
                      onChanged: (on) => _edit(
                        draft.copy(
                          libraryIds: on
                              ? {...draft.libraryIds, library.id}
                              : ({...draft.libraryIds}..remove(library.id)),
                        ),
                      ),
                    ),
                PickerRow<int?>(
                  title: l.adminAccessBitrate,
                  description: l.webAccessBitrateHint,
                  options: [
                    (null, words.bitrate(null)),
                    for (final rate in bitrates) (rate, words.bitrate(rate)),
                  ],
                  current: draft.maxBitrate,
                  onPicked: (rate) => _edit(draft.copy(maxBitrate: () => rate)),
                ),
                SwitchRow(
                  title: l.adminAccessTranscode,
                  description: l.webAccessTranscodeHint,
                  checked: draft.transcode,
                  onChanged: (on) => _edit(draft.copy(transcode: on)),
                ),
                PickerRow<int?>(
                  title: l.adminAccessStreams,
                  options: [
                    (null, words.streams(null)),
                    for (final count in streams) (count, words.streams(count)),
                  ],
                  current: draft.maxStreams,
                  onPicked: (count) =>
                      _edit(draft.copy(maxStreams: () => count)),
                ),
                SwitchRow(
                  title: l.adminAccessDownloads,
                  description: l.webAccessDownloadsHint,
                  checked: draft.downloads,
                  onChanged: (on) => _edit(draft.copy(downloads: on)),
                ),
              ],
            ),
            if (draft.allLibraries) Note(l.adminAccessLibrariesAllHint),
          ],
        ),
      ),
      SettingsSection(
        title: l.webAccessSectionRequests,
        child: Panel(
          rows: [
            PickerRow<String>(
              title: l.adminAccessRequests,
              options: [
                for (final mode in RequestMode.all)
                  (mode, words.requestMode(mode)),
              ],
              current: draft.requests,
              onPicked: (mode) => _edit(draft.copy(requests: mode)),
            ),
            if (draft.requests != RequestMode.off) ...[
              PickerRow<bool>(
                title: l.adminAccessRequestLimit,
                options: [
                  (false, l.adminAccessRequestLimitNone),
                  (true, l.adminAccessRequestLimitSome),
                ],
                current: quota != null,
                onPicked: (limited) => _edit(
                  draft.copy(
                    requestLimit: () => limited ? quota ?? defaultQuota : null,
                  ),
                ),
              ),
              if (quota != null)
                QuotaRow(
                  quota: quota,
                  error: _error('requestLimit'),
                  onChanged: (next) =>
                      _edit(draft.copy(requestLimit: () => next)),
                ),
            ],
          ],
        ),
      ),
      SettingsSection(
        title: l.webAccessSectionServer,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            Note(l.webAccessSectionServerHint),
            Panel(
              rows: [
                for (final MapEntry(key: area, value: levels)
                    in managedAreas.entries)
                  PickerRow<String>(
                    title: words.area(area),
                    description: words.areaHint(area),
                    options: [
                      for (final level in levels)
                        (level, words.level(area, level)),
                    ],
                    current: draft.manages[area]!,
                    onPicked: (level) => _edit(
                      draft.copy(manages: {...draft.manages, area: level}),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
      SettingsSection(
        title: l.webAccessSectionApi,
        child: Panel(
          rows: [
            SwitchRow(
              title: l.webAccessApiTokens,
              description: l.webAccessApiTokensHint,
              checked: draft.apiTokens,
              onChanged: (on) => _edit(draft.copy(apiTokens: on)),
            ),
          ],
        ),
      ),
    ];

    if (group == null) {
      return AdminPage(
        title: l.webAccessGroupNewTitle,
        actions: [
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 12),
            child: MatineeButton(
              size: ButtonSize.sm,
              onPressed: _creating || draft.name.trim().isEmpty
                  ? null
                  : () => unawaited(_create()),
              child: Text(l.webAccessGroupCreate),
            ),
          ),
        ],
        child: AdminSections(sections: sections),
      );
    }
    return SaveBarPage(
      title: l.webAccessGroupEditTitle(_groupName(l, group)),
      dirty: draft != _saved,
      canSave: everyone || draft.name.trim().isNotEmpty,
      onReset: () => setState(_restart),
      onSave: _save,
      child: AdminSections(sections: sections),
    );
  }
}
