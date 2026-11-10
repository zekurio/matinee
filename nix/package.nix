{
  lib,
  stdenvNoCC,
  fetchPnpmDeps,
  jellyfin-ffmpeg,
  ffmpegPackage ? jellyfin-ffmpeg,
  nodejs_24,
  nodejs-slim_24,
  pnpm_11,
  pnpmConfigHook,
  makeWrapper,
  version ? "0.0.0",
  source ? import ./source.nix {
    inherit lib;
    root = ../.;
  },
  # Update with the hash nix prints after pnpm-lock.yaml changes.
  pnpmDepsHash ? "sha256-+N9+TBn/ji+Y81jiy2JCoaGM1UlK+eQ4dKzrGY5+Ozg=",
}:

let
  pnpmPackage = import ./pnpm.nix { inherit pnpm_11; };
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "matinee";
  inherit version;
  src = source;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpmPackage;
    fetcherVersion = 4;
    hash = pnpmDepsHash;
  };

  nativeBuildInputs = [
    nodejs_24
    pnpmPackage
    pnpmConfigHook
    makeWrapper
  ];

  # The server is one bundled file and the web app is static, so nothing
  # from node_modules ships and no shebang needs patching.
  dontPatchShebangs = true;

  buildPhase = ''
    runHook preBuild

    export HOME="$TMPDIR/home"
    export DO_NOT_TRACK=1
    mkdir -p "$HOME"

    pnpm --filter @matinee/server build
    pnpm --filter @matinee/web build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    # esbuild bundles the server and its dependencies into one file, which
    # finds its migrations at ../drizzle.
    mkdir -p "$out/share/matinee"
    cp -R apps/server/dist/server "$out/share/matinee/server"
    cp -R apps/server/dist/drizzle "$out/share/matinee/drizzle"
    cp -R apps/web/dist "$out/share/matinee/web"
    install -Dm644 LICENSE "$out/share/doc/matinee/LICENSE"

    # nodejs-slim: the full nodejs keeps node-gyp headers and their -dev
    # closures, which the server never needs. NODE_ENV is set, not
    # defaulted, so an inherited environment can't put the server in
    # development mode. ffmpeg and ffprobe are absolute paths, so the
    # server runs the build it was packaged with.
    makeWrapper "${lib.getExe nodejs-slim_24}" "$out/bin/matinee" \
      --add-flags "$out/share/matinee/server/index.mjs" \
      --set NODE_ENV production \
      --set-default MATINEE_WEB_DIST "$out/share/matinee/web" \
      --set-default MATINEE_FFMPEG_PATH "${lib.getExe' ffmpegPackage "ffmpeg"}" \
      --set-default MATINEE_FFPROBE_PATH "${lib.getExe' ffmpegPackage "ffprobe"}"

    runHook postInstall
  '';

  passthru = {
    inherit ffmpegPackage;
  };

  meta = {
    description = "Self-hosted media server";
    license = lib.licenses.mit;
    mainProgram = "matinee";
    platforms = [ "x86_64-linux" ];
  };
})
