import { MarketChrome } from "@/components/layouts/MarketChrome";
import { auth } from "@/lib/auth";
import { BrowseClient } from "@/components/marketplace/BrowseClient";

export const metadata = { title: "Browse courses · Lyceum" };

/**
 * /browse — the full catalog behind the homepage's "See all N →" link
 * (which was dead text until this page existed). Search-as-you-type
 * happens client-side in BrowseClient; `?q=` seeds it so searches are
 * shareable.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  return (
    <MarketChrome role={session?.user?.role ?? null}>
      <BrowseClient initialQ={sp.q ?? ""} />
    </MarketChrome>
  );
}
