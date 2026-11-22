// What the TV player asks of the screen: the refresh rates it can switch
// to at the size it has, and asking for one while a video plays. `just
// flutter pigeon` writes the Dart and Kotlin sides; don't edit those.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/display.g.dart',
    kotlinOut:
        'android/app/src/main/kotlin/io/github/zekurio/matinee/display/Display.g.kt',
    kotlinOptions: KotlinOptions(package: 'io.github.zekurio.matinee.display'),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
@HostApi()
abstract class DisplayApi {
  /// The refresh rates of the display's modes at its current resolution, in Hz.
  /// Empty when the display doesn't say.
  List<double> refreshRates();

  /// Asks for the mode at [rate] and the current resolution, through the
  /// window's preferred display mode, which switches even when the display
  /// can't do it seamlessly. Null lets go, back to the system's choice.
  void preferRefreshRate(double? rate);
}
