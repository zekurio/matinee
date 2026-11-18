# Matinee for iPhone, iPad, and Apple TV

Native SwiftUI apps on iOS and tvOS 18 or later, written in Swift 6. They
follow the Android apps' screens and look like the web app.

Build on a Mac with Xcode 26 or later. `just ios` lists the recipes, which
take XcodeGen and Node from Nixpkgs; `XCODEGEN=xcodegen` and `NODE=node`
use your own instead. `Matinee.xcodeproj` is generated from `project.yml`
and not committed.

```sh
just ios build      # the iPhone and iPad app, for a simulator
just ios tv-build   # the Apple TV app
just ios test       # MatineeCore's tests, the kit boundary tests, generated files
```

The apps have run on simulators only, and nothing signs or releases them
yet.

## License

GPL-3.0, see [LICENSE](LICENSE), because the apps link MPVUI's GPL builds
of libmpv and FFmpeg. MatineeCore and the rest of the repository stay MIT.
