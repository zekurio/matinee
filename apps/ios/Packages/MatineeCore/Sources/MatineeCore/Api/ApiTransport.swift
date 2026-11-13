import Foundation

public enum Explicit<Value: Codable & Sendable & Hashable>: Codable, Sendable, Hashable {
  case omitted, null
  case value(Value)
  public init(from decoder: any Decoder) throws {
    let c = try decoder.singleValueContainer()
    self = c.decodeNil() ? .null : .value(try c.decode(Value.self))
  }
  public func encode(to encoder: any Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .omitted:
      throw EncodingError.invalidValue(
        self,
        .init(
          codingPath: encoder.codingPath,
          debugDescription: "Omitted fields must be encoded by their parent"))
    case .null: try c.encodeNil()
    case .value(let v): try c.encode(v)
    }
  }
}

public enum JSONValue: Codable, Sendable, Hashable {
  case null
  case bool(Bool)
  case integer(Int64)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])
  public init(from decoder: any Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() {
      self = .null
    } else if let v = try? c.decode(Bool.self) {
      self = .bool(v)
    } else if let v = try? c.decode(Int64.self) {
      self = .integer(v)
    } else if let v = try? c.decode(Double.self) {
      self = .number(v)
    } else if let v = try? c.decode(String.self) {
      self = .string(v)
    } else if let v = try? c.decode([JSONValue].self) {
      self = .array(v)
    } else {
      self = .object(try c.decode([String: JSONValue].self))
    }
  }
  public func encode(to encoder: any Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .null: try c.encodeNil()
    case .bool(let v): try c.encode(v)
    case .integer(let v): try c.encode(v)
    case .number(let v): try c.encode(v)
    case .string(let v): try c.encode(v)
    case .array(let v): try c.encode(v)
    case .object(let v): try c.encode(v)
    }
  }
}

func wireText<T>(_ value: T?) -> String? { value.map { String(describing: $0) } }
public struct ApiException: Error, Sendable, Equatable, LocalizedError {
  public let status: Int
  public let code: String?
  public let message: String
  public var errorDescription: String? { message }
}
public struct ApiErrorBody: Codable, Sendable, Hashable {
  public var code: String?
  public var status: Int?
  public var message: String?
  public init(code: String? = nil, status: Int? = nil, message: String? = nil) {
    self.code = code
    self.status = status
    self.message = message
  }
}
public struct FilePart: Sendable {
  public let bytes: Data
  public let type: String
  public let name: String
  public init(bytes: Data, type: String, name: String) {
    self.bytes = bytes
    self.type = type
    self.name = name
  }
}
public struct RequestBody: Sendable {
  let data: Data
  let contentType: String
}

private final class OriginRedirectDelegate: NSObject, URLSessionTaskDelegate {
  let base: URL
  init(base: URL) { self.base = base }
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest
  ) async -> URLRequest? {
    func port(_ url: URL) -> Int? { url.port ?? (url.scheme == "https" ? 443 : 80) }
    guard let url = request.url, url.scheme == base.scheme, url.host == base.host,
      port(url) == port(base)
    else { return nil }
    return request
  }
}

public final class ApiTransport: Sendable {
  public let base: URL
  private let session: URLSession
  private let tokenProvider: @Sendable () async throws -> String?
  private let onUnauthorized: @Sendable () async -> Void
  public init(
    base: URL, configuration: URLSessionConfiguration = .default,
    tokenProvider: @escaping @Sendable () async throws -> String? = { nil },
    onUnauthorized: @escaping @Sendable () async -> Void = {}
  ) {
    self.base = base
    self.session = URLSession(
      configuration: configuration, delegate: OriginRedirectDelegate(base: base), delegateQueue: nil
    )
    self.tokenProvider = tokenProvider
    self.onUnauthorized = onUnauthorized
  }
  deinit { session.invalidateAndCancel() }
  public func json<T: Encodable>(_ value: T) throws -> RequestBody {
    RequestBody(data: try JSONEncoder().encode(value), contentType: "application/json")
  }
  public func form(fields: [(String, String?)], files: [(String, FilePart)]) -> RequestBody {
    let boundary = UUID().uuidString
    var data = Data()
    func append(_ text: String) { data.append(Data(text.utf8)) }
    func escaped(_ text: String) -> String {
      text.replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
        .replacingOccurrences(of: "\"", with: "%22")
    }
    for (key, value) in fields {
      if let value {
        append(
          "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(escaped(key))\"\r\n\r\n\(value)\r\n"
        )
      }
    }
    for (key, file) in files {
      append(
        "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(escaped(key))\"; filename=\"\(escaped(file.name))\"\r\nContent-Type: \(escaped(file.type))\r\n\r\n"
      )
      data.append(file.bytes)
      append("\r\n")
    }
    append("--\(boundary)--\r\n")
    return RequestBody(data: data, contentType: "multipart/form-data; boundary=\(boundary)")
  }
  private func request(
    method: String, path: [String], query: [(String, String?)], body: RequestBody?
  ) async throws -> URLRequest {
    var url = base.appending(path: "api/v1")
    for part in path { url.append(component: part) }
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
    let items = query.compactMap { key, value in value.map { URLQueryItem(name: key, value: $0) } }
    if !items.isEmpty { components.queryItems = items }
    var request = URLRequest(url: components.url!)
    request.httpMethod = method
    request.httpBody = body?.data ?? (method == "GET" || method == "DELETE" ? nil : Data())
    request.setValue(body?.contentType, forHTTPHeaderField: "Content-Type")
    if let token = try await tokenProvider() {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    return request
  }
  private func validate(_ response: URLResponse, data: Data) async throws {
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    if http.statusCode == 401 { await onUnauthorized() }
    guard (200..<300).contains(http.statusCode) else {
      let parsed = try? JSONDecoder().decode(ApiErrorBody.self, from: data)
      throw ApiException(
        status: http.statusCode, code: parsed?.code,
        message: parsed?.message ?? "The server answered \(http.statusCode).")
    }
  }
  public func call<T: Decodable & Sendable>(
    method: String, path: [String], query: [(String, String?)], body: RequestBody?
  ) async throws -> T {
    let request = try await request(method: method, path: path, query: query, body: body)
    let (data, response) = try await session.data(for: request)
    try await validate(response, data: data)
    return try JSONDecoder().decode(T.self, from: data.isEmpty ? Data("null".utf8) : data)
  }
  public func send(method: String, path: [String], query: [(String, String?)], body: RequestBody?)
    async throws
  {
    let request = try await request(method: method, path: path, query: query, body: body)
    let (data, response) = try await session.data(for: request)
    try await validate(response, data: data)
  }
  // Like Android, a single subscription ends at EOF. Only trickplayUntilSettled reconnects.
  public func events<T: Decodable & Sendable>(
    method: String, path: [String], query: [(String, String?)], body: RequestBody?
  ) -> AsyncThrowingStream<T, any Error> {
    AsyncThrowingStream { continuation in
      let task = Task {
        do {
          var request = try await self.request(method: method, path: path, query: query, body: body)
          request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
          let (bytes, response) = try await session.bytes(for: request)
          if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            var data = Data()
            for try await byte in bytes { data.append(byte) }
            try await validate(response, data: data)
          }
          var event = "message"
          for try await line in bytes.lines {
            try Task.checkCancellation()
            if line.isEmpty {
              event = "message"
            } else if line.hasPrefix("event:") {
              event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:"), event == "message" {
              let data = Data(line.dropFirst(5).trimmingCharacters(in: .whitespaces).utf8)
              continuation.yield(try JSONDecoder().decode(T.self, from: data))
            }
          }
          continuation.finish()
        } catch { continuation.finish(throwing: error) }
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
}
