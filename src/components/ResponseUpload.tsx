import type { Outcome } from "@/lib/types";
import { OUTCOME_NAME } from "@/lib/rounds";
import { SubmitButton } from "./SubmitButton";

type Row = Record<string, any>;

/** Upload the bureau's reply, see what the AI read from it, and confirm. Shared by the client and staff letter pages. */
export function ResponseUpload({ docs, suggestions, upload, confirm, hidden, fileBase, aiOn }: {
  docs: Row[]; suggestions: Record<string, { outcome: Outcome; quote: string }>; aiOn: boolean;
  upload: (f: FormData) => Promise<void>; confirm: (f: FormData) => Promise<void>; hidden: React.ReactNode; fileBase: string;
}) {
  const n = Object.keys(suggestions).length;
  return (
    <div style={{ margin: "4px 0 16px" }}>
      <form action={upload} className="row" style={{ alignItems: "flex-end" }}>
        {hidden}
        <div style={{ flex: "1 1 260px" }}>
          <label>Got a reply? Upload a photo or PDF of it</label>
          <input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp" />
        </div>
        <SubmitButton className="btn dark" pending="Reading the reply…">Upload reply</SubmitButton>
      </form>
      <p className="fine" style={{ margin: "6px 0 0" }}>{aiOn ? "We read the reply and suggest a result for each item. Nothing is recorded until you confirm." : "Reading replies automatically is not switched on yet; the file is kept with this letter."}</p>
      {docs.length > 0 && (
        <p className="small" style={{ margin: "8px 0 0" }}>Replies on file: {docs.map((d, i) => <a key={d.id} href={`${fileBase}/${d.id}`} target="_blank" rel="noopener" style={{ marginRight: 10 }}>{d.filename || `reply ${i + 1}`}</a>)}</p>
      )}
      {n > 0 && (
        <form action={confirm} className="notice row between" style={{ marginTop: 12 }}>
          {hidden}
          <span><strong>{n} result{n > 1 ? "s" : ""} read from the reply.</strong> Check each suggestion below against the letter, then confirm. You can also record any item by hand.</span>
          <button className="btn accent" type="submit">Confirm suggested results</button>
        </form>
      )}
    </div>
  );
}

export function Suggested({ s }: { s?: { outcome: Outcome; quote: string } }) {
  if (!s) return null;
  return <div className="small" style={{ marginTop: 4 }}><span className="pill accent">Suggested: {OUTCOME_NAME[s.outcome]}</span>{s.quote && <span className="muted"> “{s.quote}”</span>}</div>;
}
