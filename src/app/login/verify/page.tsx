import { completeSignIn } from "@/app/actions";
import { TopBar } from "@/components/ui";
import { PRODUCT } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** A button rather than an automatic sign-in: email scanners open links ahead of people and would use up the one-time token. */
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <TopBar brand={PRODUCT} nav={false} />
      <main className="wrap" style={{ maxWidth: 460 }}>
        <h1>Welcome back</h1>
        <form action={completeSignIn} className="card">
          <input type="hidden" name="token" value={token ?? ""} />
          <p className="muted">Tap the button to finish signing in on this device.</p>
          <button className="btn accent big" type="submit" style={{ width: "100%" }}>Sign in</button>
        </form>
      </main>
    </>
  );
}
