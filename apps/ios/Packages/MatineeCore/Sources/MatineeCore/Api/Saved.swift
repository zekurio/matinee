import Foundation

// There are no older iOS saves to repair. Missing required fields remain errors.
public func decodeSaved<T: Decodable>(_ type: T.Type, text: String) throws -> T {
  try JSONDecoder().decode(type, from: Data(text.utf8))
}
