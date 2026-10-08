/** Validates configuration at server start so problems are logged immediately, not on first hit. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getContainer } = await import("@/infrastructure/composition");
  getContainer();
}
