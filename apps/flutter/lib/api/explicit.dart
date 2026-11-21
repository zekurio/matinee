/// A field that can be omitted, set to null, or given a value.
///
/// A null [Explicit] reference omits the field. An [Explicit] instance
/// includes it in the request, even when [value] is null.
final class Explicit<T extends Object> {
  const Explicit(this.value);

  final T? value;
}
