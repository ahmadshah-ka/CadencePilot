import { getContainer } from "@/infrastructure/composition";

export const dynamic = "force-dynamic";

/** Foundation placeholder; the public site arrives in feature 04. Access policy: public. */
export default function HomePage() {
  const { config } = getContainer();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">
        {config.ok ? config.config.app.name : "Setup required"}
      </h1>
      <p className="mt-3" style={{ color: "var(--color-muted)" }}>
        {config.ok
          ? "The project foundation is running."
          : "Server configuration is incomplete. Check the server log or run npm run check:config."}
      </p>
    </main>
  );
}
