import { LinkButton } from "@/presentation/components/ui/button";

/** Also used for owner-only areas requested by non-owners, so their existence is not revealed. */
export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-(--cp-gutter)"
    >
      <h1 className="font-display text-4xl">Page not found</h1>
      <p className="text-muted">The page does not exist, or you do not have access to it.</p>
      <div>
        <LinkButton href="/" variant="secondary">
          Go to the home page
        </LinkButton>
      </div>
    </main>
  );
}
