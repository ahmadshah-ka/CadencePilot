/** Injected time source so tests and use cases never read the system clock directly. */
export interface Clock {
  now(): Date;
}
