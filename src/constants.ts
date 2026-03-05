export const DEFAULT_NEO4J_VERSION = '5.26.0';
export const DEFAULT_EDITION = 'community' as const;
export const DEFAULT_INSTANCE_NAME = 'default';
export const DEFAULT_JAVA_VERSION = 21;

export const DEFAULT_PORTS = {
  bolt: 7687,
  http: 7474,
  https: 7473,
} as const;

export const DEFAULT_USERNAME = 'neo4j';

export const NEO4J_DIST_BASE_URL = 'https://dist.neo4j.org';
export const ADOPTIUM_API_BASE_URL = 'https://api.adoptium.net/v3';

export const CACHE_DIR_NAME = 'neo4j-local';
export const DATA_DIR_NAME = 'neo4j-local';

export const STARTUP_TIMEOUT_MS = 120_000;
export const HEALTH_CHECK_INTERVAL_MS = 1_000;
export const SHUTDOWN_TIMEOUT_MS = 30_000;
export const DOWNLOAD_TIMEOUT_MS = 300_000;

export const MAX_DOWNLOAD_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1_000;

export const PASSWORD_LENGTH = 16;
