import { requireOperator } from "@/lib/opsession";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();
  return <>{children}</>;
}
