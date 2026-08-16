import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user";
import { listWatchlist } from "@/lib/watchlist";
import { logoutAction } from "@/app/auth/actions";
import Dashboard from "@/components/Dashboard";

// Watchlist data is per-request and mutated via the API routes, so this page
// should never be statically cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  // Middleware already redirects unauthenticated requests to /login — this
  // is a defensive fallback, not the primary gate.
  if (!user) redirect("/login");

  const companies = await listWatchlist(user.id);

  return (
    <Dashboard
      initialCompanies={companies}
      initialCadence={user.digest_cadence}
      userEmail={user.email}
      logoutAction={logoutAction}
    />
  );
}
