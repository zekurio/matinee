import Foundation
import Observation

/// RequestSheet.kt. Construct a fresh instance each time the sheet opens.
@MainActor @Observable public final class RequestChooser {
  public let ref: CatalogRef
  public let seasons: [CatalogSeason]
  public let first: Bool
  public private(set) var picked: Set<Int>
  public private(set) var future: Bool
  public var libraryId: String?
  public init(ref: CatalogRef, seasons: [CatalogSeason], first: Bool, defaultFuture: Bool, libraryId: String?, only: Int? = nil) {
    self.ref = ref; self.seasons = seasons; self.first = first; self.libraryId = libraryId
    picked = requestChooserStart(seasons, only: only)
    future = first && defaultFuture && only == nil
  }
  public var chosen: [CatalogSeason] { seasons.filter { picked.contains($0.number) } }
  public var label: RequestChooserLabel {
    ref.kind == "show" ? requestChooserLabel(chosen: chosen, future: future, first: first) : .title
  }
  public var scope: ShowScope? {
    ref.kind == "show" ? ShowScope(seasons: chosen.map(\.number), future: future && first) : nil
  }
  public func toggle(_ number: Int) {
    guard seasons.contains(where: { $0.number == number && ["ask", "add"].contains($0.availability.action ?? "") }) else { return }
    if !picked.insert(number).inserted { picked.remove(number) }
  }
  public func setFuture(_ on: Bool) { future = first && on }
}

/// An Undo window for a completed first ask. Cancel is sent only when the
/// viewer explicitly undoes, never when the six-second window expires.
@MainActor @Observable public final class RequestAskFlow {
  public private(set) var busy = false
  public private(set) var item: RequestItem?
  public private(set) var failure: Failure?
  public private(set) var undoId: String?
  public private(set) var wantsNotificationPermission = false
  @ObservationIgnored private var expiry: Task<Void, Never>?
  @ObservationIgnored private let duration: Duration
  public init(undoDuration: Duration = .seconds(6)) { duration = undoDuration }
  public func submit(_ chooser: RequestChooser, availability: Availability, askedPermission: Bool, actions: RequestActions) async {
    guard !busy, availability.requestBlocked == nil, chooser.label != .pickOne else { return }
    busy = true; failure = nil
    defer { busy = false }
    do {
      let result = try await actions.ask(CatalogInput(ref: chooser.ref, libraryId: chooser.libraryId), scope: chooser.scope)
      item = result
      wantsNotificationPermission = !askedPermission
      expiry?.cancel()
      undoId = chooser.first && (result.availability.action == "cancel" || result.season?.action == "cancel") ? result.id : nil
      if undoId != nil {
        let duration = duration
        expiry = Task { [weak self] in
          do { try await Task.sleep(for: duration) } catch { return }
          self?.undoId = nil
        }
      }
    } catch { if Failure(error) != .cancelled { failure = Failure(error) } }
  }
  public func undo(actions: RequestActions) async {
    guard let id = undoId else { return }
    expiry?.cancel(); undoId = nil
    do { try await actions.cancel(id: id) }
    catch { if Failure(error) != .cancelled { failure = Failure(error) } }
  }
  deinit { expiry?.cancel() }
}
