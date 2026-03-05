export class Logger {
  private readonly verbose: boolean;
  private readonly prefix: string;

  constructor(prefix: string, verbose: boolean = false) {
    this.prefix = prefix;
    this.verbose = verbose || process.env.NEO4J_LOCAL_DEBUG === '1';
  }

  info(message: string, ...args: unknown[]): void {
    console.log(`[${this.prefix}] ${message}`, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.verbose) {
      console.log(`[${this.prefix}:debug] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[${this.prefix}:warn] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[${this.prefix}:error] ${message}`, ...args);
  }
}
