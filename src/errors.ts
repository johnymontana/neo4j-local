export class Neo4jLocalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'Neo4jLocalError';
  }
}

export class DownloadError extends Neo4jLocalError {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly statusCode?: number,
  ) {
    super(message, 'DOWNLOAD_ERROR');
    this.name = 'DownloadError';
  }
}

export class JavaNotFoundError extends Neo4jLocalError {
  constructor(message: string) {
    super(message, 'JAVA_NOT_FOUND');
    this.name = 'JavaNotFoundError';
  }
}

export class StartupError extends Neo4jLocalError {
  constructor(message: string) {
    super(message, 'STARTUP_ERROR');
    this.name = 'StartupError';
  }
}

export class StateError extends Neo4jLocalError {
  constructor(currentState: string, attemptedAction: string) {
    super(
      `Cannot ${attemptedAction} while in state "${currentState}"`,
      'INVALID_STATE',
    );
    this.name = 'StateError';
  }
}

export class TimeoutError extends Neo4jLocalError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation "${operation}" timed out after ${timeoutMs}ms`,
      'TIMEOUT',
    );
    this.name = 'TimeoutError';
  }
}
