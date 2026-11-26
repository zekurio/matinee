import 'package:flutter/material.dart' as material;
import 'package:flutter/widgets.dart';

import 'glass.dart';
import 'icon.dart';
import 'theme.dart';
import 'tokens.dart';

typedef MenuTriggerBuilder = Widget Function(
  BuildContext context,
  VoidCallback toggle,
  bool isOpen,
  FocusNode focusNode,
);

/// Which edge of its trigger a menu lines up with.
enum MenuSide {
  /// Its start edge, under where the trigger starts: a button's menu.
  start,

  /// Its end edge, under where the trigger ends: a row whose value sits at
  /// its end, as a settings picker's.
  end,
}

/// A menu that opens under its trigger, lined up with the trigger's
/// [side], and moved over only where the screen's edge makes it.
class Menu extends StatefulWidget {
  const Menu({
    super.key,
    required this.trigger,
    required this.children,
    this.side = MenuSide.start,
  });

  final MenuTriggerBuilder trigger;
  final List<Widget> children;
  final MenuSide side;

  @override
  State<Menu> createState() => _MenuState();
}

class _MenuState extends State<Menu> {
  final _trigger = FocusNode();
  final _controller = material.MenuController();
  var _open = false;

  // No rebuild for these: only a page going out of sight reads them, and
  // that builds the menu again by itself.
  void _opened() => _open = true;

  void _closed() => _open = false;

  Future<bool> _back() async {
    if (!_controller.isOpen) return false;
    _controller.close();
    return true;
  }

  @override
  void dispose() {
    _trigger.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // A page that went out of sight, as a tab another replaced, takes its
    // menu with it; left open, its unseen scrim would eat every touch.
    if (_open && !TickerMode.valuesOf(context).enabled) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _controller.close());
    }
    final direction = Directionality.of(context);
    final anchor = _anchor(context, direction);
    // System Back closes an open menu before it does anything else, and
    // otherwise goes on as if the menu weren't here. Always in place, so
    // the anchor under it isn't built anew as the menu opens.
    final backable = Router.maybeOf(context) == null
        ? anchor
        : BackButtonListener(onBackButtonPressed: _back, child: anchor);
    if (widget.side == MenuSide.start) return backable;
    // Material lines a menu's start up with the anchor's start, and in a
    // right-to-left anchor that's its right edge, measured from the menu's
    // own. So the anchor alone reads the other way, and what it holds
    // reads as the page does.
    return Directionality(
      textDirection: direction == TextDirection.ltr
          ? TextDirection.rtl
          : TextDirection.ltr,
      child: backable,
    );
  }

  Widget _anchor(BuildContext context, TextDirection direction) =>
      material.MenuAnchor(
        controller: _controller,
        onOpen: _opened,
        onClose: _closed,
        childFocusNode: _trigger,
        alignmentOffset: const Offset(-8, 4),
        consumeOutsideTap: true,
        animated: !MediaQuery.disableAnimationsOf(context),
        clipBehavior: Clip.none,
        style: const material.MenuStyle(
          alignment: AlignmentDirectional.bottomStart,
          padding: WidgetStatePropertyAll(EdgeInsets.zero),
          backgroundColor: WidgetStatePropertyAll(Color(0x00000000)),
          surfaceTintColor: WidgetStatePropertyAll(Color(0x00000000)),
          elevation: WidgetStatePropertyAll(0),
        ),
        menuChildren: [
          Directionality(
            textDirection: direction,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: MenuPanel(children: widget.children),
            ),
          ),
        ],
        builder: (context, controller, child) => Directionality(
          textDirection: direction,
          child: Builder(
            builder: (context) => widget.trigger(
              context,
              () {
                if (controller.isOpen) {
                  controller.close();
                } else {
                  controller.open();
                }
              },
              controller.isOpen,
              _trigger,
            ),
          ),
        ),
      );
}

class MenuPanel extends StatelessWidget {
  const MenuPanel({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Glass(
      shape: KitRadius.panel,
      border: Border.all(color: colors.hairline),
      shadow: const [
        BoxShadow(
          color: Color(0x66000000),
          offset: Offset(0, 10),
          blurRadius: 25,
        ),
      ],
      child: ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 160, maxWidth: 360),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: IntrinsicWidth(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ),
      ),
    );
  }
}

class MenuItem extends StatelessWidget {
  const MenuItem({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.selected,
    this.autofocus = false,
    this.destructive = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final String? icon;
  final bool? selected;
  final bool autofocus;

  /// In the danger color, as removing someone or something.
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final color = destructive ? colors.danger : colors.foreground;
    // One node, so TalkBack says the tick on the button it lands on.
    return MergeSemantics(
      child: Semantics(
        button: true,
        selected: selected,
        child: material.MenuItemButton(
          onPressed: onPressed,
          autofocus: autofocus,
          style: material.ButtonStyle(
            textStyle: WidgetStatePropertyAll(KitText.sm.style()),
            foregroundColor: WidgetStateProperty.resolveWith(
              (states) => color.withValues(
                alpha: states.contains(WidgetState.disabled) ? .5 : 1,
              ),
            ),
            overlayColor: WidgetStateProperty.resolveWith(
              (states) =>
                  states.any(
                    const {
                      WidgetState.hovered,
                      WidgetState.focused,
                      WidgetState.pressed,
                    }.contains,
                  )
                  ? color.withValues(
                      alpha: destructive && colors.isDark ? .2 : .1,
                    )
                  : const Color(0x00000000),
            ),
            shape: const WidgetStatePropertyAll(
              RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(KitRadius.md)),
              ),
            ),
            minimumSize: const WidgetStatePropertyAll(Size.zero),
            padding: const WidgetStatePropertyAll(
              EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            ),
            tapTargetSize: material.MaterialTapTargetSize.shrinkWrap,
            visualDensity: material.VisualDensity.standard,
            splashFactory: material.NoSplash.splashFactory,
          ),
          // Not Material's leading and trailing icons: it spaces them 12 from
          // the label, and the web's gap is 6.
          child: Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 6,
            children: [
              if (icon case final icon?) KitIcon(icon, size: 16),
              Expanded(child: Text(label)),
              if (selected ?? false) const KitIcon(Lucide.check, size: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class MenuLabel extends StatelessWidget {
  const MenuLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    child: Text(
      label,
      style: KitText.xs.style(
        color: MatineeTheme.of(context).mutedForeground,
        weight: FontWeight.w500,
      ),
    ),
  );
}

class MenuSeparator extends StatelessWidget {
  const MenuSeparator({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: SizedBox(
      height: 1,
      child: ColoredBox(color: MatineeTheme.of(context).hairline),
    ),
  );
}
