# CLAUDE.md

Instructions for AI assistants working on this codebase.

## Project Overview

`@johnymontana/neo4j-local` is an npm package that downloads, installs, configures, and manages local Neo4j database instances. It provides both a programmatic TypeScript API and a CLI. The package auto-downloads Neo4j distributions and a compatible JRE, installs plugins (APOC, GDS, GenAI), and manages the full process lifecycle.

## Build & Test Commands

```bash
npm run build              # Build with tsup (ESM + CJS + CLI)
npm run lint               # Type check with tsc --noEmit
npm test                   # Run all tests
npm run test:unit          # Unit tests only (fast, no network)
npm run test:integration   # CLI integration tests (requires build first)
npm run test:e2e           # End-to-end lifecycle tests (downloads real binaries, slow)
npm run test:coverage      # Unit tests with v8 coverage
```

Always run `npm run build` before `npm run test:integration` — the CLI tests execute the compiled output in `dist/`.

## Project Structure

```
src/
  index.ts                 # Public API exports (Neo4jLocal, types, errors)
  neo4j-local.ts           # Main orchestrator class (state machine, lifecycle)
  types.ts                 # All TypeScript interfaces and types
  constants.ts             # Default values, URLs, timeouts
  errors.ts                # Error class hierarchy (Neo4jLocalError base)
  logger.ts                # Simple logger with verbose/env var support
  platform-resolver.ts     # OS/arch detection, system Java discovery
  binary-manager.ts        # Neo4j download, extract, cache management
  java-manager.ts          # JRE detection and Adoptium download
  runtime-manager.ts       # Process spawn, health check, shutdown
  config-manager.ts        # neo4j.conf generation, plugin installation, credentials
  download-utils.ts        # HTTP download with retry and tar extraction
  fs-utils.ts              # Path helpers, password generation, PID/credentials files
  cli/
    index.ts               # CLI entry point (no shebang — tsup adds it)
    commands/               # One file per CLI subcommand (start, stop, status, etc.)
tests/
  unit/                    # 11 test files, ~144 tests (no network needed)
  integration/             # CLI integration tests (runs compiled dist/)
  e2e/                     # Full lifecycle tests (downloads real Neo4j + JRE)
```

## Architecture

The codebase follows a manager-based architecture with dependency injection:

- **Neo4jLocal** — Orchestrator with state machine (`new` → `installing` → `installed` → `starting` → `running` → `stopping` → `stopped` | `error`). Extends `EventEmitter`.
- **PlatformResolver** — Maps `process.platform`/`process.arch` to Neo4j distribution suffixes and Adoptium API parameters.
- **BinaryManager** — Downloads Neo4j from `https://dist.neo4j.org/neo4j-{edition}-{version}-{unix|windows}.{tar.gz|zip}`, caches by version/edition.
- **JavaManager** — Checks system Java (JAVA_HOME → PATH), falls back to downloading from Adoptium API. Handles macOS `Contents/Home/` JRE layout.
- **ConfigManager** — Generates `neo4j.conf` with instance-specific directory overrides, installs plugins from bundled `labs/`/`products/` dirs, runs `neo4j-admin dbms set-initial-password`.
- **RuntimeManager** — Spawns `bin/neo4j console` with `NEO4J_CONF` env var pointing to instance conf dir. Polls HTTP endpoint for health check. SIGTERM → timeout → SIGKILL for shutdown.

**Key design pattern**: Shared binary cache (`~/.cache/neo4j-local/{version}/{edition}/`) with per-instance data (`~/.local/share/neo4j-local/{instanceName}/`). Data isolation is achieved via `server.directories.*` settings in neo4j.conf and the `NEO4J_CONF` environment variable.

## Code Conventions

- TypeScript with strict mode. Target: ES2022, module: ESNext.
- Dual ESM + CJS output via tsup. Two tsup configs in an array: library (no banner) and CLI (with shebang banner).
- Only 2 runtime dependencies: `commander` and `tar`. Everything else uses Node.js built-ins (native `fetch`, `fs/promises`, `child_process`).
- Node.js >= 18.0.0 required.
- Source files use `.js` extensions in imports (TypeScript moduleResolution: bundler).
- The CLI entry point at `src/cli/index.ts` must NOT have a shebang line — tsup's banner config adds it during build.
- Tests use vitest with `globals: true`. Test files are in `tests/` (not co-located with source).

## Plugin System

Plugins are installed by copying JAR files from the Neo4j distribution's bundled directories to the instance `plugins/` directory:

- **APOC**: `labs/apoc-*.jar` (fallback: `products/apoc-*.jar`)
- **GDS**: `products/graph-data-science-*.jar` or `products/gds-*.jar`
- **GenAI**: `products/neo4j-genai-*.jar`

The neo4j.conf includes `dbms.security.procedures.unrestricted` and `dbms.security.procedures.allowlist` entries for installed plugins.

Default plugins: `['apoc', 'gds', 'genai']` (exported as `DEFAULT_PLUGINS`).

## Common Pitfalls

- `toEndWith` is NOT a valid vitest/chai matcher. Use `expect(str.endsWith(suffix)).toBe(true)` or `expect(str).toMatch(/suffix$/)`.
- `downloadFile()` only creates parent directories AFTER a successful HTTP response. If the fetch itself fails (DNS error, etc.), no directories are created.
- DNS resolution failures in `downloadFile` are non-retryable — the retry logic only retries on 5xx status codes, `AbortError`, `ECONNRESET`, and `ETIMEDOUT`.
- When testing download behavior, use `https://this-domain-does-not-exist-12345.com/` as a reliable non-existent domain.

## CI

GitHub Actions workflow at `.github/workflows/ci.yml`:
- **lint**: Type check (Node 22, ubuntu)
- **unit-tests**: Matrix of Node 18/20/22 on ubuntu + macOS
- **integration-tests**: CLI tests after build (depends on lint)
- **e2e-tests**: Full lifecycle (depends on unit + integration)
- **build**: Verify dist output files and CLI shebang
