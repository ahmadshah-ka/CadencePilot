export type LogFields = Readonly<Record<string, unknown>>;

/** Structured logger port. Implementations must redact secrets and private content. */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger that adds the given fields (e.g. traceId) to every entry. */
  child(fields: LogFields): Logger;
}
