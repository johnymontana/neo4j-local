# neo4j-local

Download, install, and manage a local Neo4j database instance. Zero-config graph database setup for Node.js.

`neo4j-local` automatically downloads Neo4j and a compatible JRE, configures an instance with sensible defaults (including APOC, GDS, and GenAI plugins), and manages the full lifecycle — all from a single API call or CLI command.

```bash
npx neo4j-local start
```

```
Neo4j is running!

  Bolt URI:  bolt://localhost:7687
  HTTP URL:  http://localhost:7474
  Username:  neo4j
  Password:  a1B2c3D4e5F6g7H8
  Plugins:   apoc, gds, genai

Press Ctrl+C to stop.
```

## Installation

```bash
npm install neo4j-local
```

Requires Node.js >= 18.0.0. Java is downloaded automatically if not found on the system.

## Quick Start

### Programmatic API

```typescript
import { Neo4jLocal } from 'neo4j-local';

const neo4j = new Neo4jLocal();
const credentials = await neo4j.start();

console.log(credentials.uri);      // bolt://localhost:7687
console.log(credentials.password);  // auto-generated

// ... use Neo4j ...

await neo4j.stop();
```

### Static Factory

```typescript
import { Neo4jLocal } from 'neo4j-local';

const neo4j = await Neo4jLocal.create();
// Instance is already running

await neo4j.stop();
```

### Async Dispose

```typescript
await using neo4j = new Neo4jLocal();
await neo4j.start();
// Automatically stopped when leaving scope
```

### With neo4j-driver

```typescript
import { Neo4jLocal } from 'neo4j-local';
import neo4j from 'neo4j-driver';

const local = await Neo4jLocal.create();
const creds = local.getCredentials();

const driver = neo4j.driver(creds.uri, neo4j.auth.basic(creds.username, creds.password));
const session = driver.session();

await session.run('CREATE (n:Person {name: $name}) RETURN n', { name: 'Alice' });

await session.close();
await driver.close();
await local.stop();
```

## CLI

All commands are available via `npx neo4j-local` or by installing globally.

### start

Start a local Neo4j instance. Downloads Neo4j and Java on first run.

```bash
neo4j-local start [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--version <version>` | `5.26.0` | Neo4j version |
| `--edition <edition>` | `community` | `community` or `enterprise` |
| `--instance <name>` | `default` | Instance name (for running multiple) |
| `--bolt-port <port>` | `7687` | Bolt protocol port |
| `--http-port <port>` | `7474` | HTTP browser port |
| `--password <password>` | auto-generated | Set a specific password |
| `--plugins <list>` | `apoc,gds,genai` | Comma-separated plugin list |
| `--no-plugins` | | Disable all plugins |
| `--ephemeral` | `false` | Delete instance data on stop |
| `--verbose` | `false` | Show debug output |

### stop

```bash
neo4j-local stop [--instance <name>]
```

### status

```bash
neo4j-local status [--instance <name>]
```

### credentials

```bash
neo4j-local credentials [--instance <name>] [--json]
```

### reset

Stop a running instance (if any) and wipe its data directory.

```bash
neo4j-local reset [--instance <name>] [--force]
```

### install

Download and cache Neo4j and Java without starting.

```bash
neo4j-local install [--version <version>] [--edition <edition>] [--verbose]
```

### versions

List cached Neo4j versions.

```bash
neo4j-local versions
```

### clear-cache

Remove all cached Neo4j and JRE downloads.

```bash
neo4j-local clear-cache [--force]
```

## API Reference

### `new Neo4jLocal(options?)`

Create a new instance manager.

```typescript
const neo4j = new Neo4jLocal({
  version: '5.26.0',
  edition: 'community',
  instanceName: 'default',
  ephemeral: false,
  plugins: ['apoc', 'gds', 'genai'],
  ports: { bolt: 7687, http: 7474, https: 7473 },
  credentials: { username: 'neo4j', password: 'mypassword' },
  javaVersion: 21,
  verbose: false,
});
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `version` | `string` | `'5.26.0'` | Neo4j version to download |
| `edition` | `'community' \| 'enterprise'` | `'community'` | Neo4j edition |
| `instanceName` | `string` | `'default'` | Instance name for multi-instance setups |
| `ephemeral` | `boolean` | `false` | Delete data directory on stop |
| `plugins` | `Neo4jPlugin[]` | `['apoc', 'gds', 'genai']` | Plugins to install |
| `ports` | `PortConfig` | `{ bolt: 7687, http: 7474, https: 7473 }` | Port configuration |
| `credentials` | `CredentialConfig` | auto-generated | Username and password |
| `javaVersion` | `number` | `21` | Java version to use |
| `allowAutoDownloadJava` | `boolean` | `true` | Download JRE if not found |
| `allowAutoDownloadNeo4j` | `boolean` | `true` | Download Neo4j if not cached |
| `cachePath` | `string` | XDG cache dir | Override binary cache directory |
| `dataPath` | `string` | XDG data dir | Override instance data directory |
| `neo4jConf` | `Record<string, string>` | `{}` | Additional neo4j.conf entries |
| `startupTimeout` | `number` | `120000` | Startup timeout in ms |
| `verbose` | `boolean` | `false` | Enable debug logging |

### Methods

#### `install(onProgress?): Promise<void>`

Download Neo4j and Java (if needed), set up instance directory, install plugins, and generate configuration. Callable from states: `new`, `stopped`.

#### `start(onProgress?): Promise<Neo4jCredentials>`

Start the Neo4j process. Auto-calls `install()` if not already installed. Returns connection credentials.

```typescript
const creds = await neo4j.start();
// { uri: 'bolt://localhost:7687', username: 'neo4j', password: '...', httpUrl: 'http://localhost:7474' }
```

#### `stop(): Promise<void>`

Gracefully stop the running instance. Idempotent (safe to call when already stopped). If `ephemeral: true`, deletes the instance data directory.

#### `reset(): Promise<void>`

Stop (if running), wipe all instance data, and re-initialize configuration if binaries are cached.

#### `getCredentials(): Neo4jCredentials`

Return connection credentials for the current instance.

#### `getStatus(): Promise<Neo4jStatus>`

Return current instance status including state, PID, ports, version, edition, and uptime.

#### `getState(): Neo4jLocalState`

Return the current state: `new`, `installing`, `installed`, `starting`, `running`, `stopping`, `stopped`, or `error`.

#### `getInstanceDir(): string`

Return the filesystem path to the instance data directory.

#### `static create(options?): Promise<Neo4jLocal>`

Factory method that creates an instance and starts it in one call.

### Events

`Neo4jLocal` extends `EventEmitter`:

```typescript
neo4j.on('stateChange', (newState, oldState) => {
  console.log(`${oldState} -> ${newState}`);
});
```

### Error Classes

All errors extend `Neo4jLocalError` with a machine-readable `code` property.

| Class | Code | Description |
|-------|------|-------------|
| `Neo4jLocalError` | varies | Base error class |
| `DownloadError` | `DOWNLOAD_ERROR` | Binary download failure |
| `JavaNotFoundError` | `JAVA_NOT_FOUND` | Java not available |
| `StartupError` | `STARTUP_ERROR` | Neo4j failed to start |
| `StateError` | `INVALID_STATE` | Invalid state transition |
| `TimeoutError` | `TIMEOUT` | Operation timed out |

## Plugins

APOC, GDS, and GenAI plugins are installed by default. They are copied from the Neo4j distribution's bundled `labs/` and `products/` directories into the instance `plugins/` directory.

Disable all plugins:

```typescript
const neo4j = new Neo4jLocal({ plugins: [] });
```

Select specific plugins:

```typescript
const neo4j = new Neo4jLocal({ plugins: ['apoc'] });
```

## Architecture

```
Neo4jLocal (orchestrator)
  ├── PlatformResolver   — OS/arch/Java detection
  ├── BinaryManager      — Download, cache Neo4j distributions
  ├── JavaManager         — Detect or auto-download JRE
  ├── RuntimeManager      — Spawn/kill neo4j process, health checks
  └── ConfigManager       — Generate neo4j.conf, set credentials, install plugins
```

**Binary cache**: `~/.cache/neo4j-local/` (respects `XDG_CACHE_HOME`)
Shared across instances — downloaded once, reused.

**Instance data**: `~/.local/share/neo4j-local/{instanceName}/` (respects `XDG_DATA_HOME`)
Each instance has its own data, logs, and configuration.

## Multiple Instances

Run multiple isolated Neo4j instances on different ports:

```typescript
const instance1 = new Neo4jLocal({
  instanceName: 'dev',
  ports: { bolt: 7687, http: 7474 },
});

const instance2 = new Neo4jLocal({
  instanceName: 'test',
  ports: { bolt: 7688, http: 7475 },
});

await instance1.start();
await instance2.start();
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEO4J_LOCAL_DEBUG=1` | Enable debug logging (equivalent to `verbose: true`) |
| `XDG_CACHE_HOME` | Override cache directory base path |
| `XDG_DATA_HOME` | Override data directory base path |

## Platform Support

| Platform | Architecture | Status |
|----------|-------------|--------|
| macOS | x64, arm64 | Supported |
| Linux | x64, arm64 | Supported |
| Windows | x64 | Supported |

## Development

```bash
npm install
npm run build
npm test
```

### Test Tiers

```bash
npm run test:unit          # Unit tests (no network, fast)
npm run test:integration   # CLI integration tests (requires build)
npm run test:e2e           # Full lifecycle (downloads Neo4j, slow)
npm run test:coverage      # Unit tests with coverage report
```

## License

Apache-2.0
