import Link from "next/link";
import { redirect } from "next/navigation";
import { startOnboarding } from "@/app/actions";
import { Flash, TopBar } from "@/components/ui";
import { currentClient } from "@/lib/session";
import { getTenant } from "@/lib/store";

export default async function Start({ searchParams }: { searchParams: Promise<{ t?: string; error?: string }> }) {
  const { t, error } = await searchParams;
  if (await currentClient()) redirect("/dashboard");
  const tenant = getTenant(t ?? "default");
  const F = ({ name, label, type = "text", ...rest }: { name: string; label: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} required {...rest} /></div>
  );
  return (
    <>
      <TopBar brand={tenant.name} nav={false} />
      <main className="wrap narrow">
        <ol className="steps"><li className="now">Your details</li><li>Your rights</li><li>Sign</li></ol>
        <h1>Tell us who you are</h1>
        <p className="muted">These details go on your dispute letters, so they must match your credit file.</p>
        <Flash error={error} />
        <form action={startOnboarding} className="card">
          <input type="hidden" name="tenant" value={tenant.slug} />
          <F name="name" label="Full legal name" autoComplete="name" />
          <div className="grid g2">
            <F name="email" label="Email" type="email" autoComplete="email" />
            <F name="phone" label="Mobile phone (optional)" type="tel" required={false} autoComplete="tel" />
          </div>
          <F name="address" label="Street address" autoComplete="street-address" />
          <div className="grid g3">
            <F name="city" label="City" autoComplete="address-level2" />
            <F name="state" label="State" maxLength={2} placeholder="OH" autoComplete="address-level1" />
            <F name="zip" label="ZIP" inputMode="numeric" autoComplete="postal-code" />
          </div>
          <div className="grid g2">
            <F name="dob" label="Date of birth" type="date" />
            <F name="ssnLast4" label="Last 4 of Social Security number" inputMode="numeric" maxLength={4} pattern="\d{4}" />
          </div>
          <div className="grid g2">
            <div className="field">
              <label htmlFor="businessStage">Your business</label>
              <select id="businessStage" name="businessStage" required defaultValue="">
                <option value="" disabled>Choose one</option>
                <option value="operating">I own an operating business</option>
                <option value="starting">I am starting a business</option>
                <option value="planning">I plan to start one later</option>
                <option value="none">No business</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="fundingGoal">Funding you hope to reach (optional)</label>
              <select id="fundingGoal" name="fundingGoal" defaultValue="">
                <option value="">Not sure yet</option>
                <option>Under $25,000</option><option>$25,000 to $100,000</option><option>Over $100,000</option>
              </select>
            </div>
          </div>
          <button className="btn accent big" type="submit">Continue</button>
          <p className="fine" style={{ marginTop: 14, marginBottom: 0 }}>We store only the last 4 digits of your Social Security number.</p>
        </form>
        <p className="small muted">Already signed up? <Link href="/login">Sign in</Link></p>
      </main>
    </>
  );
}
