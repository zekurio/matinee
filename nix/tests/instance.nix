# A server with the local database, checked through its API: it migrates,
# serves the web app, finds ffmpeg, and takes the setup token from a
# credential.
{ pkgs, module }:

pkgs.testers.runNixOSTest {
  name = "matinee-instance";

  nodes.server = {
    imports = [ module ];

    virtualisation.memorySize = 2048;

    services.matinee = {
      enable = true;
      publicUrl = "https://watch.example.test";
      transcoding.hardwareAcceleration = "none";
      settings.MATINEE_SCAN_INTERVAL_HOURS = 0;
      secrets.MATINEE_SETUP_TOKEN = "/etc/matinee/setup-token";
    };

    environment.etc."matinee/setup-token" = {
      text = "0123456789abcdef0123456789abcdef\n";
      mode = "0400";
    };

    environment.systemPackages = [
      pkgs.curl
      pkgs.jq
    ];
  };

  testScript = ''
    import json

    server.wait_for_unit("matinee.service")
    server.wait_until_succeeds("curl -fsS http://127.0.0.1:8420/api/health", timeout=120)

    def rpc(procedure, body="{}"):
        out = server.succeed(
            f"curl -sS -X POST -H 'content-type: application/json' "
            f"http://127.0.0.1:8420/api/rpc/{procedure} -d '{body}'"
        )
        return json.loads(out).get("json")

    with subtest("the web app is served"):
        page = server.succeed("curl -fsS http://127.0.0.1:8420/setup")
        assert "<!doctype html>" in page.lower(), page[:200]

    with subtest("setup asks for the token from the credential"):
        config = rpc("auth/config")
        assert config["setup"] == {
            "accountRequired": True,
            "mode": "passkey",
            "tokenRequired": True,
        }, config
        wrong = rpc("auth/unlockSetup", '{"json":{"token":"nope"}}')
        assert wrong["code"] == "BAD_REQUEST", wrong
        rpc("auth/unlockSetup", '{"json":{"token":"0123456789abcdef0123456789abcdef"}}')
        server.fail("journalctl -u matinee | grep -q 'Setup token:'")

    with subtest("the server runs ffmpeg in its sandbox"):
        server.wait_until_succeeds(
            "journalctl -u matinee | grep -q 'Detected ffmpeg .*Jellyfin'", timeout=60
        )

    with subtest("state lands in the service's directories"):
        server.succeed("test -d /var/lib/matinee")
        server.succeed("test -d /var/cache/matinee/transcodes")
        server.succeed("test \"$(stat -c %U /var/lib/matinee)\" = matinee")

    with subtest("admin procedures need a session"):
        refused = rpc("admin/transcoding/get")
        assert refused["code"] == "UNAUTHORIZED", refused
  '';
}
