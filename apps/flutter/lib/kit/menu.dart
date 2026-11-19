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

class Menu extends StatefulWidget {
  const Menu({super.key, required this.trigger, required this.children});

  final MenuTriggerBuilder trigger;
  final List<Widget> children;

  @override
  State<Menu> createState() => _MenuState();
}

class _MenuState extends State<Menu> {
  final _trigger = FocusNode();

  @override
  void dispose() {
    _trigger.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => material.MenuAnchor(
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
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: MenuPanel(children: widget.children),
      ),
    ],
    builder: (context, controller, child) => widget.trigger(
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
    this.destructive = false,
    this.autofocus = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final String? icon;
  final bool? selected;
  final bool destructive;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final color = destructive ? colors.danger : colors.foreground;
    return Semantics(
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
