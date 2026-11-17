import Link from "next/link";
import { redirect } from "next/navigation";
import { requestSignIn } from "@/app/actions";
import { Flash, TopBar } from "@/components/ui";
import { PRODUCT } from "@/lib/brand";
import { currentClient } from "@/lib/session";
import { signInAvailable } from "@/lib/signin";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  if (await currentClient()) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <>
      <TopBar brand={PRODUCT} nav={false} />
      <main className="wrap" style={{ maxWidth: 460 }}>
        <h1>Sign in</h1>
        <p className="muted">No password needed. We send a one-time link to the email or mobile number you signed up with.</p>
        <Flash {...sp} />
        {signInAvailable() ? (
          <form action={requestSignIn} className="card">
            <div className="field"><label htmlFor="contact">Email or mobile number</label><input id="contact" name="contact" type="text" required autoComplete="email" inputMode="email" /></div>
            <button className="btn accent big" type="submit" style={{ width: "100%" }}>Send my sign-in link</button>
          </form>
        ) : <div className="notice">Sign-in links are not switched on yet. Please contact the company that invited you.</div>}
        <p className="small muted">New here? <Link href="/start">Create a free account</Link>. Staff? <Link href="/console/login">Staff sign-in</Link>.</p>
      </main>
    </>
  );
}
