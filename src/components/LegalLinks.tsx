import Link from "next/link";

/** Footer links required on every public page: privacy policy, terms, and the opt-out California law calls for. */
export function LegalLinks({ dark = true }: { dark?: boolean }) {
  const style = dark ? undefined : { color: "var(--gray-7)" };
  return (
    <span className="legal-links">
      <Link href="/privacy" style={style}>Privacy policy</Link> · <Link href="/terms" style={style}>Terms</Link> · <Link href="/privacy/choices" style={style}>Your privacy choices</Link>
    </span>
  );
}

export const contactEmail = () => process.env.CONTACT_EMAIL || "support@leverageiq100.com";
