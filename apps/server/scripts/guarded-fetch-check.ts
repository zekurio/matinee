import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { generateKeyPairSync, randomBytes, sign } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type RequestListener, type Server } from "node:http"
import { createServer as createHttpsServer } from "node:https"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync, deflateSync, brotliCompressSync } from "node:zlib"

import { isPublicAddress } from "../src/net/address"
import {
  guardedFetch,
  GuardedFetchError,
  hostAllowed,
  ruleForAddress,
  type HostRule,
} from "../src/net/guarded-fetch"

/** One DER element: a tag, the length, and what is in it. */
function der(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts)
  const size = body.length
  const length =
    size < 0x80
      ? [size]
      : size < 0x100
        ? [0x81, size]
        : [0x82, size >> 8, size & 0xff]
  return Buffer.concat([Buffer.from([tag, ...length]), body])
}
const sequence = (...parts: Buffer[]) => der(0x30, ...parts)
const oid = (hex: string) => der(0x06, Buffer.from(hex, "hex"))
const utcTime = (date: Date) =>
  der(
    0x17,
    Buffer.from(
      `${date.toISOString().replace(/[-:T]/g, "").slice(2, 14)}Z`,
      "ascii",
    ),
  )

/**
 * A certificate for the given names that signs itself and is good for two
 * days, with its key, both as PEM. Node can't make one, and a key kept in
 * the repository would be one more secret to explain, so the check writes
 * its own each run.
 */
function selfSigned(names: [string, ...string[]]) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  })
  const ecdsaSha256 = sequence(oid("2a8648ce3d040302"))
  const name = sequence(
    der(0x31, sequence(oid("550403"), der(0x0c, Buffer.from(names[0])))),
  )
  const day = 24 * 60 * 60_000
  const body = sequence(
    // Version 3, which is what has extensions.
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([1, ...randomBytes(8)])),
    ecdsaSha256,
    name,
    sequence(
      utcTime(new Date(Date.now() - day)),
      utcTime(new Date(Date.now() + day)),
    ),
    name,
    publicKey.export({ type: "spki", format: "der" }),
    der(
      0xa3,
      sequence(
        // It is its own authority, which is what lets Node trust it.
        sequence(
          oid("551d13"),
          der(0x01, Buffer.from([0xff])),
          der(0x04, sequence(der(0x01, Buffer.from([0xff])))),
        ),
        // The names it is good for.
        sequence(
          oid("551d11"),
          der(
            0x04,
            sequence(...names.map((item) => der(0x82, Buffer.from(item)))),
          ),
        ),
      ),
    ),
  )
  const certificate = sequence(
    body,
    ecdsaSha256,
    der(0x03, Buffer.from([0]), sign("sha256", body, privateKey)),
  )
  const lines = certificate.toString("base64").match(/.{1,64}/g) ?? []
  return {
    cert: `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`,
    key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  }
}

// Node reads the authorities it trusts once, when it starts. So this
// process makes the certificate and runs the checks in a fresh one that
// trusts it.
const tlsDir = process.env.MATINEE_CHECK_TLS_DIR
if (!tlsDir) {
  const dir = mkdtempSync(join(tmpdir(), "matinee-check-"))
  try {
    const made = selfSigned(["one.test", "two.test"])
    writeFileSync(join(dir, "cert.pem"), made.cert)
    writeFileSync(join(dir, "key.pem"), made.key, { mode: 0o600 })
    const child = spawnSync(
      process.execPath,
      [...process.execArgv, ...process.argv.slice(1)],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          MATINEE_CHECK_TLS_DIR: dir,
          NODE_EXTRA_CA_CERTS: join(dir, "cert.pem"),
        },
      },
    )
    process.exitCode = child.status ?? 1
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  process.exit()
}
let failures = 0
async function check(name: string, run: () => void | Promise<void>) {
  try {
    await run()
    process.stdout.write(`PASS ${name}\n`)
  } catch (cause) {
    failures++
    const message = cause instanceof Error ? cause.message : "Unknown failure"
    process.stderr.write(`FAIL ${name} ${JSON.stringify(message)}\n`)
  }
}
async function error(
  code: GuardedFetchError["code"],
  run: () => Promise<object>,
) {
  await assert.rejects(
    run,
    (cause: Error) => cause instanceof GuardedFetchError && cause.code === code,
  )
}
async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert(address !== null)
  // SAFETY: listen on a numeric port returns AddressInfo, never a pipe path.
  return (address as import("node:net").AddressInfo).port
}
const resolver = async () => [{ address: "127.0.0.1", family: 4 }]
let httpPort = 0
const handler: RequestListener = (req, res) => {
  const path = new URL(req.url ?? "/", "http://one.test").pathname
  if (path === "/outside") {
    res.writeHead(302, { location: "https://outside.test/" })
    res.end()
    return
  }
  if (path === "/downgrade") {
    res.writeHead(302, { location: `http://one.test:${httpPort}/` })
    res.end()
    return
  }
  if (path === "/cross") {
    res.writeHead(302, { location: `http://two.test:${httpPort}/auth` })
    res.end()
    return
  }
  if (path === "/auth") {
    res.end(req.headers.authorization ?? "absent")
    return
  }
  if (path === "/empty-redirect") {
    res.writeHead(302, { location: "" })
    res.end()
    return
  }
  if (path === "/loop") {
    res.writeHead(302, { location: "/loop" })
    res.end()
    return
  }
  const status = Number(path.slice(1))
  if ([301, 302, 303, 307, 308].includes(status)) {
    res.writeHead(status, { location: "/echo" })
    res.end()
    return
  }
  if (path === "/chain") {
    res.writeHead(307, { location: "/302" })
    res.end()
    return
  }
  if (path === "/slow") {
    res.write("first")
    const timer = setTimeout(() => res.end("last"), 500)
    res.on("close", () => clearTimeout(timer))
    return
  }
  if (path === "/headers") {
    for (const key of [
      "cookie",
      "proxy-authorization",
      "upgrade",
      "te",
      "trailer",
      "keep-alive",
      "transfer-encoding",
    ])
      assert.equal(req.headers[key], undefined)
    assert.equal(req.headers.host, `one.test:${httpPort}`)
    assert.notEqual(req.headers.connection, "evil")
    assert.notEqual(req.headers["content-length"], "999")
    assert.equal(req.headers["accept-encoding"], "gzip, deflate, br")
    res.setHeader("set-cookie", ["secret=1", "secret=2"])
    res.end(req.headers["user-agent"])
    return
  }
  const bytes = Buffer.from("x".repeat(4096))
  const encoders = new Map([
    ["gzip", gzipSync],
    ["deflate", deflateSync],
    ["br", brotliCompressSync],
  ])
  const encoding = path.slice(1)
  const encode = encoders.get(encoding)
  if (encode) {
    res.setHeader("content-encoding", encoding)
    res.end(encode(bytes))
    return
  }
  if (path === "/large") {
    res.end(bytes)
    return
  }
  if (path === "/status") {
    res.writeHead(404)
    res.end("missing")
    return
  }
  const chunks: Buffer[] = []
  req.on("data", (chunk: Buffer) => chunks.push(chunk))
  req.on("end", () =>
    res.end(`${req.method}:${Buffer.concat(chunks).toString()}`),
  )
}
const server = createServer(handler)
const tlsServer = createHttpsServer(
  {
    key: readFileSync(join(tlsDir, "key.pem")),
    cert: readFileSync(join(tlsDir, "cert.pem")),
  },
  handler,
)
try {
  httpPort = await listen(server)
  const tlsPort = await listen(tlsServer)
  const allow: HostRule[] = [
    { pattern: "one.test", port: httpPort, trusted: true },
    { pattern: "two.test", port: httpPort, trusted: true },
    { pattern: "one.test", port: tlsPort, trusted: true },
  ]
  const base = `http://one.test:${httpPort}`
  const options = { allow, testLookup: resolver }
  const text = (body: Uint8Array) => Buffer.from(body).toString()
  for (const ip of [
    "8.8.8.8",
    "1.1.1.1",
    "100.63.255.255",
    "100.128.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "192.0.1.1",
    "198.20.0.1",
    "223.255.255.255",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
    "::8.8.8.8",
    "64:ff9b::808:808",
    "2002:0808:0808::1",
  ]) {
    await check(`public address ${ip}`, () =>
      assert.equal(isPublicAddress(ip), true),
    )
  }
  for (const ip of [
    "bad",
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.1.2.3",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fdff::1",
    "fe80::1",
    "febf::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::127.0.0.1",
    "::7f00:1",
    "64:ff9b::a00:1",
    "2002:c0a8:0101::1",
  ]) {
    await check(`non-public address ${ip}`, () =>
      assert.equal(isPublicAddress(ip), false),
    )
  }
  await check("a typed address allows its own scheme and port only", () => {
    const rule = (address: string) => {
      const made = ruleForAddress(address)
      assert(made, `no rule for ${address}`)
      return [made]
    }
    const https = rule("https://nas.test")
    assert(hostAllowed("https://nas.test/hook", https))
    assert(hostAllowed("https://nas.test:443", https))
    assert(!hostAllowed("http://nas.test", https))
    assert(!hostAllowed("http://nas.test:443", https))
    assert(!hostAllowed("https://nas.test:8443", https))
    const http = rule("http://192.168.1.5:8096/jellyfin")
    assert(hostAllowed("http://192.168.1.5:8096/Users", http))
    assert(!hostAllowed("https://192.168.1.5:8096", http))
    assert(!hostAllowed("http://192.168.1.5", http))
    const plain = rule("http://nas.test")
    assert(hostAllowed("http://nas.test", plain))
    assert(!hostAllowed("https://nas.test", plain))
    assert(hostAllowed("https://[::1]:9000", rule("https://[::1]:9000")))
    assert.equal(ruleForAddress("ftp://nas.test"), undefined)
    assert.equal(ruleForAddress("https://user:pw@nas.test"), undefined)
    assert.equal(ruleForAddress("nas.test"), undefined)
  })
  await check("host matching", () => {
    const rules = [
      { pattern: "*.example.com" },
      { pattern: "EXACT.example." },
      { pattern: "bücher.example" },
    ]
    for (const url of [
      "https://a.example.com",
      "https://a.b.example.com",
      "https://A.Example.COM.",
      "https://exact.example",
      "https://xn--bcher-kva.example",
    ])
      assert(hostAllowed(url, rules))
    for (const url of [
      "https://example.com",
      "https://badexample.com",
      "https://a.example.com:444",
      "http://a.example.com",
      "https://u:p@a.example.com",
      "ftp://a.example.com",
    ])
      assert(!hostAllowed(url, rules))
    assert(
      hostAllowed("https://exact.example:8443", [
        { pattern: "exact.example", port: 8443 },
      ]),
    )
    assert(
      !hostAllowed("https://exact.example", [
        { pattern: "exact.example", port: 8443 },
      ]),
    )
    assert(
      hostAllowed("http://exact.example", [
        { pattern: "exact.example", trusted: true },
      ]),
    )
    assert(
      !hostAllowed("http://exact.example:81", [
        { pattern: "exact.example", trusted: true },
      ]),
    )
    assert(hostAllowed("https://any.example", "public"))
    assert(!hostAllowed("https://any.example:444", "public"))
  })
  await check("DNS loopback blocked at connection lookup", async () => {
    await error("blocked", () =>
      guardedFetch("https://rebind.test", {
        allow: "public",
        testLookup: resolver,
      }),
    )
    await error("blocked", () =>
      guardedFetch("https://rebind.test", {
        allow: [{ pattern: "rebind.test" }],
        testLookup: async () => [
          { address: "8.8.8.8", family: 4 },
          ...(await resolver()),
        ],
      }),
    )
  })
  await check("IP literal requires exact trusted rule", async () => {
    for (const literal of ["127.0.0.1", "0x7f.1", "[::1]", "8.8.8.8"]) {
      await error("blocked", () =>
        guardedFetch(`https://${literal}`, { allow: "public" }),
      )
      await error("blocked", () =>
        guardedFetch(`https://${literal}`, { allow: [{ pattern: literal }] }),
      )
    }
    assert(hostAllowed("https://[::1]", [{ pattern: "[::1]", trusted: true }]))
    const response = await guardedFetch(`http://127.0.0.1:${httpPort}`, {
      allow: [{ pattern: "127.0.0.1", port: httpPort, trusted: true }],
    })
    assert.equal(response.status, 200)
  })
  await check("HTTP and URL credentials blocked", async () => {
    await error("blocked", () =>
      guardedFetch(base, { allow: [{ pattern: "one.test", port: httpPort }] }),
    )
    await error("blocked", () =>
      guardedFetch(`http://user:pass@one.test:${httpPort}`, options),
    )
  })
  await check("redirect outside grant blocked", () =>
    error("blocked", () => guardedFetch(`${base}/outside`, options)),
  )
  for (const status of [301, 302, 303, 307, 308]) {
    await check(`redirect ${status} method and body`, async () => {
      const response = await guardedFetch(`${base}/${status}`, {
        ...options,
        method: "POST",
        body: "hello",
      })
      assert.equal(
        text(response.body),
        status === 307 || status === 308 ? "POST:hello" : "GET:",
      )
      assert.equal(response.url, `${base}/echo`)
    })
  }
  await check("redirect chain", async () =>
    assert.equal(
      text(
        (
          await guardedFetch(`${base}/chain`, {
            ...options,
            method: "POST",
            body: "hello",
          })
        ).body,
      ),
      "GET:",
    ),
  )
  await check("too many redirects", () =>
    error("blocked", () =>
      guardedFetch(`${base}/loop`, { ...options, maxRedirects: 2 }),
    ),
  )
  await check("HTTPS downgrade blocked", () =>
    error("blocked", () =>
      guardedFetch(`https://one.test:${tlsPort}/downgrade`, options),
    ),
  )
  await check("forbidden headers and cookies dropped", async () => {
    const response = await guardedFetch(`${base}/headers`, {
      ...options,
      userAgent: "Custom",
      headers: {
        host: "evil",
        connection: "evil",
        "content-length": "999",
        "transfer-encoding": "chunked",
        upgrade: "websocket",
        te: "trailers",
        trailer: "foo",
        "keep-alive": "1",
        cookie: "secret",
        "proxy-authorization": "secret",
      },
    })
    assert.equal(text(response.body), "Custom")
    assert(!response.headers.some(([name]) => name === "set-cookie"))
  })
  await check("invalid headers blocked", async () => {
    await error("blocked", () =>
      guardedFetch(base, { ...options, headers: { "bad\nname": "value" } }),
    )
    await error("blocked", () =>
      guardedFetch(base, { ...options, headers: { okay: "bad\r\nvalue" } }),
    )
  })
  for (const encoding of ["gzip", "deflate", "br"]) {
    await check(`${encoding} decoded`, async () =>
      assert.equal(
        text((await guardedFetch(`${base}/${encoding}`, options)).body),
        "x".repeat(4096),
      ),
    )
    await check(`${encoding} bomb stopped`, () =>
      error("too-large", () =>
        guardedFetch(`${base}/${encoding}`, { ...options, maxBytes: 64 }),
      ),
    )
  }
  await check("body limit", () =>
    error("too-large", () =>
      guardedFetch(`${base}/large`, { ...options, maxBytes: 64 }),
    ),
  )
  await check("slow body timeout", () =>
    error("timeout", () =>
      guardedFetch(`${base}/slow`, { ...options, timeoutMs: 30 }),
    ),
  )
  await check("DNS timeout", () =>
    error("timeout", () =>
      guardedFetch(base, {
        ...options,
        timeoutMs: 30,
        testLookup: () => new Promise(() => {}),
      }),
    ),
  )
  await check("abort signal", async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30)
    try {
      await error("timeout", () =>
        guardedFetch(`${base}/slow`, { ...options, signal: controller.signal }),
      )
    } finally {
      clearTimeout(timer)
    }
    await error("timeout", () =>
      guardedFetch(base, { ...options, signal: controller.signal }),
    )
  })
  await check("authorization dropped across hosts", async () =>
    assert.equal(
      text(
        (
          await guardedFetch(`${base}/cross`, {
            ...options,
            headers: { authorization: "secret" },
          })
        ).body,
      ),
      "absent",
    ),
  )
  await check("empty redirect counts toward limit", () =>
    error("blocked", () =>
      guardedFetch(`${base}/empty-redirect`, { ...options, maxRedirects: 1 }),
    ),
  )
  await check("TLS hostname verification stays enabled", () =>
    error("network", () =>
      guardedFetch(`https://wrong.test:${tlsPort}`, {
        allow: [{ pattern: "wrong.test", port: tlsPort, trusted: true }],
        testLookup: resolver,
      }),
    ),
  )
  await check("HEAD ignores body encoding", async () => {
    const response = await guardedFetch(`${base}/gzip`, {
      ...options,
      method: "HEAD",
    })
    assert.equal(response.body.length, 0)
  })
  await check("default user agent", async () => {
    assert.equal(
      text((await guardedFetch(`${base}/headers`, options)).body),
      "Matinee",
    )
  })
  await check("non-2xx returned", async () =>
    assert.equal((await guardedFetch(`${base}/status`, options)).status, 404),
  )
} finally {
  server.closeAllConnections()
  tlsServer.closeAllConnections()
  await Promise.all([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => tlsServer.close(() => resolve())),
  ])
}
process.exitCode = failures ? 1 : 0
