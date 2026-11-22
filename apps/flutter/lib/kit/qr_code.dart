import 'package:flutter/widgets.dart';
import 'package:qr/qr.dart' as qr;

import 'theme.dart';

/// [text] as a QR code, black on a white card whatever the theme: phones'
/// cameras read dark on light best, and the card's padding is the quiet zone
/// they need around it. [label] is what a screen reader says.
class QrCodeCard extends StatefulWidget {
  const QrCodeCard({
    super.key,
    required this.text,
    required this.label,
    this.size = 224,
  });

  final String text;
  final String label;
  final double size;

  @override
  State<QrCodeCard> createState() => _QrCodeCardState();
}

class _QrCodeCardState extends State<QrCodeCard> {
  late qr.QrImage _image = _encode(widget.text);

  static qr.QrImage _encode(String text) =>
      qr.QrImage(qr.QrCode(payload: qr.QrPayload.fromString(text)));

  @override
  void didUpdateWidget(QrCodeCard old) {
    super.didUpdateWidget(old);
    if (old.text != widget.text) _image = _encode(widget.text);
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final size = widget.size;
    final radius = BorderRadius.circular(size / 14);
    return Semantics(
      label: widget.label,
      image: true,
      child: ExcludeSemantics(
        child: SizedBox.square(
          dimension: size,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: const Color(0xFFFFFFFF),
              borderRadius: radius,
              border: Border.all(color: colors.border),
            ),
            child: Padding(
              padding: EdgeInsets.all(size / 14),
              child: CustomPaint(painter: _QrPainter(_image)),
            ),
          ),
        ),
      ),
    );
  }
}

class _QrPainter extends CustomPainter {
  const _QrPainter(this.image);

  final qr.QrImage image;

  @override
  void paint(Canvas canvas, Size size) {
    final modules = image.moduleCount;
    // Whole pixels per module, so neighbours meet without seams.
    final cell = (size.shortestSide / modules).floorToDouble();
    if (cell <= 0) return;
    final inset = (size.shortestSide - cell * modules) / 2;
    final paint = Paint()
      ..color = const Color(0xFF000000)
      ..isAntiAlias = false;
    for (var row = 0; row < modules; row++) {
      var column = 0;
      while (column < modules) {
        if (!image.isDark(row, column)) {
          column++;
          continue;
        }
        // One rectangle per run of dark modules in the row.
        final start = column;
        while (column < modules && image.isDark(row, column)) {
          column++;
        }
        canvas.drawRect(
          Rect.fromLTWH(
            inset + start * cell,
            inset + row * cell,
            (column - start) * cell,
            cell,
          ),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_QrPainter old) => old.image != image;
}
