export type Neo4jEdition = 'community' | 'enterprise';

export type Neo4jLocalState =
  | 'new'
  | 'installing'
  | 'installed'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

export type Neo4jPlugin = 'apoc' | 'gds' | 'genai';

export interface Neo4jLocalOptions {
  version?: string;
  edition?: Neo4jEdition;
  instanceName?: string;
  ephemeral?: boolean;
  plugins?: Neo4jPlugin[];
  ports?: PortConfig;
  credentials?: CredentialConfig;
  javaVersion?: number;
  allowAutoDownloadJava?: boolean;
  allowAutoDownloadNeo4j?: boolean;
  cachePath?: string;
  dataPath?: string;
  neo4jConf?: Record<string, string>;
  startupTimeout?: number;
  verbose?: boolean;
}

export interface PortConfig {
  bolt?: number;
  http?: number;
  https?: number;
}

export interface CredentialConfig {
  username?: string;
  password?: string;
}

export interface PlatformInfo {
  os: NodeJS.Platform;
  arch: 'x64' | 'arm64';
  neo4jDistSuffix: 'unix' | 'windows';
  archiveExtension: '.tar.gz' | '.zip';
  adoptiumOs: 'mac' | 'linux' | 'windows';
  adoptiumArch: 'x64' | 'aarch64';
}

export interface DownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  percentage: number;
}

export type DownloadProgressCallback = (progress: DownloadProgress) => void;

export interface CachedBinary {
  neo4jHome: string;
  version: string;
  edition: Neo4jEdition;
}

export interface CachedJre {
  javaHome: string;
  javaExecutable: string;
  version: number;
}

export interface Neo4jInstance {
  instanceName: string;
  state: Neo4jLocalState;
  pid?: number;
  ports: Required<PortConfig>;
  credentials: Required<CredentialConfig>;
  neo4jHome: string;
  dataDir: string;
  logsDir: string;
  confDir: string;
}

export interface Neo4jStatus {
  state: Neo4jLocalState;
  pid?: number;
  ports: Required<PortConfig>;
  version: string;
  edition: Neo4jEdition;
  uptime?: number;
}

export interface Neo4jCredentials {
  uri: string;
  username: string;
  password: string;
  httpUrl: string;
}

export interface StoredCredentials {
  username: string;
  password: string;
  ports: Required<PortConfig>;
  version: string;
  edition: Neo4jEdition;
}
