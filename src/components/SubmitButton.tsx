"use client";

import { useFormStatus } from "react-dom";

/** A submit button that shows it's working and can't be pressed twice while its form is being processed. */
export function SubmitButton({ children, pending, className = "btn accent", style }: { children: React.ReactNode; pending: string; className?: string; style?: React.CSSProperties }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={busy} aria-busy={busy} style={style}>
      {busy ? <><span className="spinner" aria-hidden="true" />{pending}</> : children}
    </button>
  );
}
