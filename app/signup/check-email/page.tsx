import Link from "next/link";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-black text-2xl text-white dark:bg-white dark:text-black">
          ✉
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Check your email
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          We sent a confirmation link{email ? <> to <strong>{email}</strong></> : ""}. Click it to
          activate your account, then log in below.
        </p>

        <Link
          href="/login"
          className="mt-8 inline-block w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Go to login
        </Link>
      </main>
    </div>
  );
}
