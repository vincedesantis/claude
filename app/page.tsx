import { getOrCreateUser } from "@/lib/user";
import { listWatchlist } from "@/lib/watchlist";
import Dashboard from "@/components/Dashboard";

// Watchlist data is per-request and mutated via the API routes, so this page
// should never be statically cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getOrCreateUser();
  const companies = await listWatchlist(user.id);

  return <Dashboard initialCompanies={companies} initialCadence={user.digest_cadence} />;
}
