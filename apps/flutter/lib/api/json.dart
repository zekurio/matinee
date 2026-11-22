import 'explicit.dart';

typedef JsonMap = Map<String, Object?>;

T? readNullable<T>(Object? value, T Function(Object?) read) {
  return value == null ? null : read(value);
}

List<T> readList<T>(Object? value, T Function(Object?) read) {
  return (value as List<Object?>).map(read).toList();
}

Map<String, T> readMap<T>(Object? value, T Function(Object?) read) {
  return (value as JsonMap).map((key, item) => MapEntry(key, read(item)));
}

Explicit<T>? readExplicit<T extends Object>(
  JsonMap fields,
  String key,
  T Function(Object?) read,
) {
  if (!fields.containsKey(key)) return null;
  return Explicit(readNullable(fields[key], read));
}
