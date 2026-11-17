import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PartnersPage } from "@/components/PartnersPage";
import { tenantForVisit } from "@/lib/branding";
import { getTenant } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Leverage IQ for professionals",
  description: "Offer credit repair and business funding under your own brand. For tax pros, credit repair firms and funding brokers.",
};

/** The operator gateway. On a company's own subdomain there is nothing to sell, so it goes to that company's page. */
export default async function Partners() {
  if ((await tenantForVisit()).id !== "tenant_default") redirect("/");
  const t = getTenant("default");
  return <PartnersPage legalName={t.legal_name ?? t.name} address={t.address} />;
}
