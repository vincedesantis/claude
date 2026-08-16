import Link from "next/link";
import { signupAction } from "@/app/auth/actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Sign up</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Investor News Digest</p>

        <form action={signupAction} className="mt-8 space-y-4">
          <input name="email" type="email" required placeholder="Email" className={inputClass} />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8 characters)"
            className={inputClass}
          />
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            placeholder="Confirm password"
            className={inputClass}
          />
          <button
            type="submit"
            className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Sign up
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
}
