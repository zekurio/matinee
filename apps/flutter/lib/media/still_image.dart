import 'package:flutter/scheduler.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/widgets.dart';

/// A picture that never moves, drawn as [Image] draws it, for artwork and
/// its placeholders.
///
/// [Image] follows [TickerMode] to pause a moving picture: whenever a tab
/// is left or shown, or a page covers the tabs or uncovers them, every
/// picture in the tab looks itself up in the image cache again and builds
/// again, all in that one frame, which on a page of cards takes longer
/// than a frame has. A still picture has nothing to pause, so this one
/// ignores [TickerMode], and builds again only when its picture does.
class StillImage extends StatefulWidget {
  const StillImage({
    super.key,
    required this.image,
    this.fit,
    this.alignment = Alignment.center,
    this.gaplessPlayback = false,
    this.frameBuilder,
    this.errorBuilder,
  });

  final ImageProvider image;
  final BoxFit? fit;
  final AlignmentGeometry alignment;

  /// Whether the last picture stays while a new [image] loads.
  final bool gaplessPlayback;

  /// As [Image.frameBuilder].
  final ImageFrameBuilder? frameBuilder;

  /// As [Image.errorBuilder].
  final ImageErrorWidgetBuilder? errorBuilder;

  @override
  State<StillImage> createState() => _StillImageState();
}

class _StillImageState extends State<StillImage> with WidgetsBindingObserver {
  ImageStream? _stream;
  ImageInfo? _info;
  int? _frame;
  bool _synchronous = false;
  bool _invertColors = false;
  Object? _error;
  StackTrace? _stack;
  late final _scrollAware = DisposableBuildContext<State<StillImage>>(this);
  late final _listener = ImageStreamListener(
    _onFrame,
    onError: _onError,
    reportErrors: false,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _invertColors =
        MediaQuery.maybeInvertColorsOf(context) ??
        SemanticsBinding.instance.accessibilityFeatures.invertColors;
    _resolve();
  }

  @override
  void didUpdateWidget(StillImage old) {
    super.didUpdateWidget(old);
    if (widget.image != old.image) _resolve();
  }

  @override
  void didChangeAccessibilityFeatures() {
    super.didChangeAccessibilityFeatures();
    setState(() {
      _invertColors =
          MediaQuery.maybeInvertColorsOf(context) ??
          SemanticsBinding.instance.accessibilityFeatures.invertColors;
    });
  }

  @override
  void reassemble() {
    _resolve();
    super.reassemble();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    final stream = _stream;
    if (stream != null) {
      // A load that fails after this went away must not be reported either.
      stream.completer?.addEphemeralErrorListener((_, _) {});
      stream.removeListener(_listener);
    }
    _scrollAware.dispose();
    _replace(null);
    super.dispose();
  }

  void _resolve() {
    final stream = ScrollAwareImageProvider<Object>(
      context: _scrollAware,
      imageProvider: widget.image,
    ).resolve(createLocalImageConfiguration(context));
    final old = _stream;
    if (old?.key == stream.key) return;
    old?.removeListener(_listener);
    setState(() {
      if (!widget.gaplessPlayback) _replace(null);
      _frame = null;
      _synchronous = false;
      _error = null;
      _stack = null;
    });
    _stream = stream..addListener(_listener);
  }

  void _onFrame(ImageInfo info, bool synchronous) {
    setState(() {
      _replace(info);
      _error = null;
      _stack = null;
      _frame = _frame == null ? 0 : _frame! + 1;
      _synchronous |= synchronous;
    });
  }

  void _onError(Object error, StackTrace? stack) {
    setState(() {
      _error = error;
      _stack = stack;
    });
  }

  /// Takes [info] in place of the picture shown, which goes once the frame
  /// that stops showing it is drawn.
  void _replace(ImageInfo? info) {
    final old = _info;
    if (old != null) {
      SchedulerBinding.instance.addPostFrameCallback((_) => old.dispose());
    }
    _info = info;
  }

  @override
  Widget build(BuildContext context) {
    final error = _error;
    final errorBuilder = widget.errorBuilder;
    if (error != null && errorBuilder != null) {
      return errorBuilder(context, error, _stack);
    }
    final Widget image = RawImage(
      image: _info?.image,
      debugImageLabel: _info?.debugLabel,
      scale: _info?.scale ?? 1,
      fit: widget.fit,
      alignment: widget.alignment,
      invertColors: _invertColors,
      filterQuality: FilterQuality.medium,
    );
    return widget.frameBuilder?.call(context, image, _frame, _synchronous) ??
        image;
  }
}
