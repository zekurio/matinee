import Foundation
import Testing

@testable import MatineeCore

/// The admin pages' forms: what Android's pages check and send, ported with them.
struct AdminFormsTest {
  @Test func saveBarFeedbackFollowsTheEdits() {
    #expect(SaveFeedback.success.shown(dirty: true) == .idle)
    #expect(SaveFeedback.success.shown(dirty: false) == .success)
    #expect(SaveFeedback.failed("no").shown(dirty: false) == .idle)
    #expect(SaveFeedback.failed("no").shown(dirty: true) == .failed("no"))
    #expect(SaveFeedback.idle.barVisible(dirty: true))
    #expect(!SaveFeedback.idle.barVisible(dirty: false))
    #expect(SaveFeedback.success.barVisible(dirty: false))
    #expect(saveFailure("  ") == .failed(nil))
    #expect(saveFailure(" Bad ") == .failed("Bad"))
  }

  @Test func numbersParseInTheirLimits() {
    let crf = TranscodingNumber.h264Crf.limits
    #expect(crf.parse("23") == 23)
    #expect(crf.parse(" 51 ") == 51)
    #expect(crf.parse("52") == nil)
    #expect(crf.parse("2.5") == nil)
    #expect(crf.parse("") == nil)
    #expect(crf.parse("abc") == nil)
    let boost = TranscodingNumber.downMixAudioBoost.limits
    #expect(boost.parse("1,5") == 1.5)
    #expect(boost.parse("0.4") == nil)
    #expect(TranscodingNumber.vppTonemappingContrast.limits.parse("0.9") == nil)
    #expect(showNumber(12) == "12")
    #expect(showNumber(0.5) == "0.5")
  }

  @Test func transcodingDraftKeepsWhatIsTypedApart() {
    var form = TranscodingDraft(AdminFixtures.decode(AdminTranscodingSettings.self, AdminFixtures.transcoding))
    #expect(!form.dirty)
    #expect(form.text(.h264Crf) == "23")
    form.type(.h264Crf, "6")
    #expect(form.draft.h264Crf == 6)
    #expect(form.invalid.isEmpty)
    #expect(form.dirty)
    form.type(.h264Crf, "")
    #expect(form.invalid == [.h264Crf])
    #expect(form.text(.h264Crf) == "")
    #expect(form.draft.h264Crf == 6)
    form.type(.h264Crf, "23")
    #expect(form.invalid.isEmpty)
    #expect(!form.dirty)
    form.type(.downMixAudioBoost, "9")
    #expect(form.dirty)
    form.reset()
    #expect(!form.dirty)
    #expect(form.text(.downMixAudioBoost) == "2")
  }

  @Test func decodersToggleWithoutRepeats() {
    var form = TranscodingDraft(AdminFixtures.decode(AdminTranscodingSettings.self, AdminFixtures.transcoding))
    #expect(form.draft.hardwareDecodingCodecs == ["h264", "vc1"])
    form.decode("hevc", true)
    form.decode("h264", true)
    #expect(form.draft.hardwareDecodingCodecs == ["h264", "vc1", "hevc"])
    form.decode("h264", false)
    #expect(form.draft.hardwareDecodingCodecs == ["vc1", "hevc"])
  }

  @Test func deviceProblems() {
    let saved = AdminFixtures.decode(AdminTranscodingSettings.self, AdminFixtures.transcoding)
    #expect(deviceProblem(saved.capabilities, HardwareAcceleration.none) == nil)
    #expect(deviceProblem(saved.capabilities, HardwareAcceleration.vaapi) == .notInBuild)
    #expect(isIntel(HardwareAcceleration.qsv) && isIntel(HardwareAcceleration.vaapi))
    #expect(!isIntel(HardwareAcceleration.videotoolbox))
  }

  @Test func authChecksTheIssuerAndScopes() {
    var form = AuthDraft(AdminFixtures.decode(AdminAuthSettings.self, AdminFixtures.auth))
    #expect(!form.dirty)
    #expect(form.canSave)
    form.oidc.issuerUrl = "auth.example.com"
    #expect(form.issuerInvalid)
    form.oidc.issuerUrl = "HTTPS://auth.example.com"
    #expect(!form.issuerInvalid)
    form.oidc.scopes = "profile email"
    #expect(form.scopesInvalid)
    form.oidc.scopes = "profile  openid"
    #expect(!form.scopesInvalid)
    form.oidc.scopes = ""
    #expect(!form.scopesInvalid)
    #expect(form.dirty)
    form.reset()
    #expect(!form.dirty)
  }

  @Test func authSecretIsSentOnlyWhenChanged() throws {
    var form = AuthDraft(AdminFixtures.decode(AdminAuthSettings.self, AdminFixtures.auth))
    #expect(form.change == .omitted)
    #expect(form.secretState == .none)
    #expect(!form.offersSecretToggle)
    form.dropSecret = true
    #expect(form.change == .null)
    #expect(form.secretState == .removed)
    form.typeSecret(" s3cret ")
    #expect(!form.dropSecret)
    #expect(form.change == .value("s3cret"))
    let json = String(decoding: try JSONEncoder().encode(form.input()), as: UTF8.self)
    #expect(json.contains("\"clientSecret\":\"s3cret\""))
    form.typeSecret("")
    let kept = String(decoding: try JSONEncoder().encode(form.input()), as: UTF8.self)
    #expect(!kept.contains("clientSecret"))
  }

  @Test func accentsNormalizeAndStoreTheDefaultAsNil() {
    #expect(normalizeHex("#ABC") == "#aabbcc")
    #expect(normalizeHex(" 3B5BDB ") == "#3b5bdb")
    #expect(normalizeHex("#12345") == nil)
    #expect(normalizeHex("#ggg") == nil)
    #expect(storedAccent("#3B5BDB", default: DEFAULT_ACCENT_LIGHT) == nil)
    var form = AccentDraft(ThemeAccents(light: nil, dark: nil))
    #expect(form.light == DEFAULT_ACCENT_LIGHT)
    #expect(!form.dirty)
    #expect(form.picked(ACCENT_PRESETS[0]))
    form.light = "#0369A1"
    form.dark = "#38bdf8"
    #expect(form.picked(ACCENT_PRESETS[1]))
    #expect(form.draft == ThemeAccents(light: "#0369a1", dark: "#38bdf8"))
    #expect(form.dirty)
    form.dark = "#38b"
    #expect(form.valid)
    form.dark = "#38"
    #expect(!form.valid)
    #expect(form.dirty)
    form.reset()
    #expect(!form.dirty)
  }

  @Test func folders() {
    #expect(parentFolder("/media/movies") == "/media")
    #expect(parentFolder("/media/movies/") == "/media")
    #expect(parentFolder("/media") == "/")
    #expect(parentFolder("/") == "/")
    #expect(folderName("/media/movies/") == "movies")
    #expect(folderName("/") == "/")
  }

  @Test func metadataLanguages() {
    #expect(defaultMetadataLanguage("de") == "de-DE")
    #expect(defaultMetadataLanguage("pt") == "pt-BR")
    #expect(defaultMetadataLanguage("fi") == "en-US")
    #expect(defaultMetadataLanguage(nil) == "en-US")
    #expect(offeredMetadataLanguages("en-US").count == METADATA_LANGUAGES.count)
    #expect(offeredMetadataLanguages("fi-FI").last?.value == "fi-FI")
  }

  @Test func libraryDraft() {
    let tmdb = MetadataProvider(id: "tmdb", name: "TMDB", description: "", episodes: true, configured: false, setup: nil)
    let tvdb = MetadataProvider(id: "tvdb", name: "TheTVDB", description: "", episodes: true, configured: true, setup: nil)
    var draft = LibraryDraft(existing: nil, providers: [tmdb, tvdb], deviceLanguage: "de")
    #expect(draft.provider == "tvdb")
    #expect(draft.language == "de-DE")
    #expect(draft.kind == LibraryKind.movies)
    #expect(!draft.valid)
    draft.name = "  Films "
    draft.add("/media/films")
    draft.add("/media/films")
    #expect(draft.paths == ["/media/films"])
    #expect(draft.valid)
    #expect(draft.input.name == "Films")
    draft.pick(provider: "tmdb", from: [tmdb, tvdb])
    #expect(draft.provider == "tvdb")
    draft.pick(provider: nil, from: [tmdb, tvdb])
    #expect(draft.provider == nil)
    #expect(draft.pickerStart(existing: nil, knownPath: nil) == "/media")
    draft.remove("/media/films")
    #expect(draft.pickerStart(existing: nil, knownPath: "/srv/tv") == "/srv")
    #expect(draft.pickerStart(existing: nil, knownPath: nil) == nil)

    let library = Library(
      id: "1", name: "Shows", kind: "shows", paths: ["/srv/shows"], itemCount: 1, titleCount: 3,
      metadataProvider: nil, metadataLanguage: "fr-FR", lastScannedAt: nil, scanning: false, refreshing: false,
      backdrop: nil)
    let editing = LibraryDraft(existing: library, providers: [tvdb], deviceLanguage: "de")
    #expect(editing.provider == nil)
    #expect(editing.language == "fr-FR")
    #expect(libraryState(library, providers: [tvdb]) == .idle(titles: 3, provider: nil))
    var busy = library
    busy.refreshing = true
    busy.metadataProvider = "tvdb"
    #expect(libraryState(busy, providers: [tvdb]) == .fetching(provider: "TheTVDB"))
    #expect(librariesBusy([library, busy]))
    busy.scanning = true
    #expect(libraryState(busy, providers: nil) == .scanning)
  }

  @Test func folderPickerBar() {
    let root = DirectoryListing(path: "/", parent: nil, directories: [])
    let media = DirectoryListing(path: "/srv/media", parent: "/srv", directories: [])
    #expect(pickerBar(nil, added: []) == .openRoot)
    #expect(pickerBar(root, added: []) == .openRoot)
    #expect(pickerBar(media, added: ["/srv/media"]) == .alreadyAdded("/srv/media"))
    #expect(pickerBar(media, added: []) == .adds(path: "/srv/media", name: "media"))
  }

  @Test func theLastAdminStays() {
    let users = AdminFixtures.decode([AdminUser].self, AdminFixtures.users)
    let admin = users.first { $0.isAdmin }!
    let viewer = users.first { !$0.isAdmin }!
    #expect(isLastAdmin(admin, of: users))
    #expect(!isLastAdmin(viewer, of: users))
    #expect(UserAction.delete(admin).strandsServer(lastAdmin: true))
    #expect(UserAction.role(admin, admin: false).strandsServer(lastAdmin: true))
    #expect(!UserAction.signOut(admin).strandsServer(lastAdmin: true))
    #expect(!UserAction.delete(viewer).strandsServer(lastAdmin: false))
  }

  @Test func queueStatus() {
    var queue = AdminFixtures.decode(JobQueueStatus.self, AdminFixtures.queue)
    #expect(queueParts(queue) == [.idle])
    queue.active = 1
    queue.waiting = 12
    queue.failed = 2
    #expect(queueParts(queue) == [.running(active: 1, concurrency: 1), .waiting(12), .failed(2)])
    queue.active = 0
    #expect(queueParts(queue) == [.waiting(12), .failed(2)])
    queue.paused = true
    #expect(queueParts(queue).first == .paused)
  }

  @Test func taskStatus() {
    var task = AdminFixtures.decode(ScheduledTask.self, AdminFixtures.task)
    #expect(taskRunLine(task) == .completed(endedAt: "2026-11-13T09:26:51.498Z", took: "2 s"))
    #expect(taskSchedule(task) == .daily)
    #expect(!taskFailed(task))
    task.intervalSeconds = 43_200
    #expect(taskSchedule(task) == .every("12 h 0 min"))
    task.intervalSeconds = 600
    #expect(taskSchedule(task) == .every("10 min"))
    task.intervalSeconds = nil
    #expect(taskSchedule(task) == .manual)
    task.lastRun?.result = TaskResult.failed
    task.lastRun?.error = "disk full"
    #expect(taskRunLine(task) == .failed("disk full"))
    #expect(taskFailed(task))
    task.startedAt = "2026-11-13T09:26:51.498Z"
    #expect(!taskFailed(task))
    #expect(taskRunLine(task) == .running)
    task.progress = 0.426
    #expect(taskRunLine(task) == .percent(42))
    task.lastRun = nil
    task.startedAt = nil
    #expect(taskRunLine(task) == .neverRan)
  }

  @Test func durations() {
    #expect(formatTook(seconds: 45) == "45 s")
    #expect(formatTook(seconds: 720) == "12 min")
    #expect(formatTook(seconds: 12_000) == "3 h 20 min")
  }

  @Test func onlyChangedConcurrencyIsSaved() {
    let queue = AdminFixtures.decode(JobQueueStatus.self, AdminFixtures.queue)
    var fixed = queue
    fixed.id = "library-scan"
    fixed.concurrencyNote = nil
    let overview = JobsOverview(queues: [queue, fixed], tasks: [])
    #expect(tunableQueues(overview).map(\.id) == ["trickplay"])
    #expect(changedConcurrency(overview, edits: ["trickplay": 1]).isEmpty)
    #expect(changedConcurrency(overview, edits: ["trickplay": 3, "library-scan": 2]) == ["trickplay": 3])
    #expect(changedConcurrency(nil, edits: ["trickplay": 3]).isEmpty)
  }
}
