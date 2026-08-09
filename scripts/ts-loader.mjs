// Minimal Node ESM loader hook that lets scripts/test-gemini-menu.mjs import
// this project's .ts files directly, without adding a bundler/test-runner
// dependency. Two things Node's native loader doesn't do out of the box:
//   1. Strip TS types (via the `typescript` package already in devDependencies)
//   2. Resolve extensionless specifiers (e.g. `./menu`) to their `.ts` file,
//      matching the "moduleResolution": "bundler" behavior used by Next.js
// Also shims `server-only` to a no-op, since its default export throws
// unconditionally when imported outside a webpack "react-server" build.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { resolve as resolvePath } from 'node:path'
import ts from 'typescript'

const SERVER_ONLY_SHIM = 'sofra-shim:server-only'

export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') {
    return { url: SERVER_ONLY_SHIM, shortCircuit: true }
  }

  if (specifier.startsWith('@/')) {
    specifier = pathToFileURL(resolvePath(process.cwd(), specifier.slice(2))).href
  }

  try {
    return await next(specifier, context)
  } catch (err) {
    if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(specifier + ext, context)
      } catch {
        // try the next extension
      }
    }
    throw err
  }
}

export async function load(url, context, next) {
  if (url === SERVER_ONLY_SHIM) {
    return { format: 'module', source: 'export {}', shortCircuit: true }
  }

  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: url,
    })
    return { format: 'module', source: outputText, shortCircuit: true }
  }

  return next(url, context)
}
