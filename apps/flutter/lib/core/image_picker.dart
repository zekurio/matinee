import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/system.g.dart';

export '../platform/system.g.dart' show PickedImage;

/// Picks one image from the device, as the Kotlin app's `PickVisualMedia`:
/// the system's photo picker, through [SystemApi.pickImage]. Null when the
/// person backs out, or where the platform has no picker.
typedef ImagePicker = Future<PickedImage?> Function(int maxBytes);

Future<PickedImage?> _pickFromSystem(int maxBytes) async {
  try {
    return await SystemApi().pickImage(maxBytes);
  } on MissingPluginException {
    return null;
  } on PlatformException {
    return null;
  }
}

/// The picker; tests answer with their own image.
final imagePickerProvider = Provider<ImagePicker>((ref) => _pickFromSystem);
