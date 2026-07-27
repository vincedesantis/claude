export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-2 px-6 py-32 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Investor News Digest
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Watchlist management is coming in Phase 1.
        </p>
      </main>
    </div>
  );
}
