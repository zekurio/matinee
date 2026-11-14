// Diagnose the release variant's behavior when WebAssembly.Memory cannot grow.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import variant from "@jitl/quickjs-ng-wasmfile-release-sync"
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
} from "quickjs-emscripten-core"

const bytes = await readFile(
  new URL(import.meta.resolve("@jitl/quickjs-ng-wasmfile-release-sync/wasm")),
)
const module = await newQuickJSWASMModuleFromVariant(
  newVariant(variant, {
    wasmBinary: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    wasmMemory: new WebAssembly.Memory({ initial: 256, maximum: 256 }),
  }),
)
using runtime = module.newRuntime()
runtime.setMemoryLimit(64 * 1024 * 1024)
using context = runtime.newContext()
using result = context.evalCode('let a = ["x"]; while (true) a = a.concat(a)')
assert(result.error)
const error = JSON.stringify(context.dump(result.error))
assert.match(error, /out of memory/i)
process.stdout.write(
  `ok fixed 16 MB wasm heap, 64 MB QuickJS limit: ${error}\n`,
)
