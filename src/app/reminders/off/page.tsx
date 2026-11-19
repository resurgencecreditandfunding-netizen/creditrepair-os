import { stopReminderEmails } from "@/app/actions";
import { TopBar } from "@/components/ui";
import { PRODUCT } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** A button rather than an automatic stop, so mail scanners opening the link don't unsubscribe anyone. */
export default async function RemindersOff({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams;
  return (
    <>
      <TopBar brand={PRODUCT} nav={false} />
      <main className="wrap" style={{ maxWidth: 480 }}>
        <h1>Stop follow-up emails</h1>
        {done ? <div className="card">{done === "1" ? "Done. You won't get any more reminder or follow-up emails. Your account and documents are unchanged." : "That link isn't valid. Sign in and turn reminders off on your Documents page instead."}</div> : (
          <form action={stopReminderEmails} className="card">
            <input type="hidden" name="t" value={t ?? ""} />
            <p>Stop all reminder and follow-up emails about your account? You can turn them back on any time from your Documents page.</p>
            <button className="btn dark" type="submit">Stop the emails</button>
          </form>
        )}
      </main>
    </>
  );
}
