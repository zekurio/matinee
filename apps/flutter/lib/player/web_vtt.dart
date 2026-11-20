import 'package:flutter/widgets.dart';

/// WebVTT delivered by the server uses the original file's clock.
class WebVtt {
  WebVtt._(this._cues);

  factory WebVtt.parse(String source) {
    final cues = <({double start, double end, TextSpan text})>[];
    final blocks = source
        .replaceAll(RegExp(r'\r\n?'), '\n')
        .split(RegExp(r'\n[ \t]*\n'));
    for (final block in blocks) {
      final lines = block.trimLeft().split('\n');
      if (lines.first.startsWith(_metadata)) continue;
      final at = lines.indexWhere(_timing.hasMatch);
      if (at < 0 || at == lines.length - 1) continue;
      final match = _timing.firstMatch(lines[at])!;
      final start = _seconds(match[1]!);
      final end = _seconds(match[2]!);
      if (end > start) {
        cues.add((
          start: start,
          end: end,
          text: _styled(lines.skip(at + 1).join('\n').trimRight()),
        ));
      }
    }
    cues.sort((a, b) => a.start.compareTo(b.start));
    return WebVtt._(cues);
  }

  final List<({double start, double end, TextSpan text})> _cues;
  static final _metadata = RegExp(r'^(WEBVTT|NOTE|STYLE|REGION)(\s|$)');
  static final _timing = RegExp(
    r'^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})(?:\s|$)',
  );
  static final _tag = RegExp(r'<[^>]*>');
  static const _entities = {
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': '\u00a0',
    '&amp;': '&',
    '&lrm;': '\u200e',
    '&rlm;': '\u200f',
  };
  static final _entity = RegExp(_entities.keys.join('|'));

  List<TextSpan> at(double seconds) {
    var low = 0;
    var high = _cues.length;
    while (low < high) {
      final middle = (low + high) ~/ 2;
      if (_cues[middle].start <= seconds) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    // The Android player also checks the last 16 cues for overlaps.
    return [
      for (final cue in _cues.getRange((low - 16).clamp(0, low), low))
        if (cue.end > seconds) cue.text,
    ];
  }

  static double _seconds(String stamp) => stamp
      .replaceAll(',', '.')
      .split(':')
      .fold(0.0, (time, part) => time * 60 + double.parse(part));

  static TextSpan _styled(String text) {
    final styles = {'b': 0, 'i': 0, 'u': 0};
    final spans = <TextSpan>[];
    var start = 0;
    void append(int end) {
      if (end == start) return;
      spans.add(
        TextSpan(
          text: text
              .substring(start, end)
              .replaceAllMapped(_entity, (match) => _entities[match[0]]!),
          style: TextStyle(
            fontWeight: styles['b']! > 0 ? FontWeight.bold : null,
            fontStyle: styles['i']! > 0 ? FontStyle.italic : null,
            decoration: styles['u']! > 0 ? TextDecoration.underline : null,
          ),
        ),
      );
    }

    for (final tag in _tag.allMatches(text)) {
      append(tag.start);
      final token = tag[0]!.toLowerCase();
      final name = token.replaceAll(RegExp(r'[</>]'), '');
      if (styles[name] case final count?) {
        styles[name] = token.startsWith('</')
            ? (count - 1).clamp(0, count)
            : count + 1;
      }
      start = tag.end;
    }
    append(text.length);
    return TextSpan(children: spans);
  }
}
