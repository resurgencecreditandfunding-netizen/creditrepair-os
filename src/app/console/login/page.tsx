import { redirect } from "next/navigation";
import { signIn } from "@/app/console/actions";
import { Flash, ConsoleBrand } from "@/components/ui";
import { currentOperator } from "@/lib/opsession";
import { DEMO } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentOperator()) redirect("/console");
  const { error } = await searchParams;
  return (
    <>
      <header className="topbar"><div className="topbar-in"><ConsoleBrand /></div></header>
      <main className="wrap" style={{ maxWidth: 420 }}>
        <h1>Staff sign in</h1>
        <p className="muted">For credit repair firms, tax professionals, and platform staff.</p>
        <Flash error={error} />
        <form action={signIn} className="card">
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="username" /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" /></div>
          <button className="btn accent big" type="submit" style={{ width: "100%" }}>Sign in</button>
        </form>
        {DEMO && <p className="fine">Demo login: admin@demo.local / demo-console</p>}
      </main>
    </>
  );
}
