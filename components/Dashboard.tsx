"use client";

import { useEffect, useRef, useState } from "react";
import type { Cadence } from "@/lib/settings";

type Company = {
  id: string;
  ticker: string;
  company_name: string;
  added_at: string;
};

type SymbolMatch = { ticker: string; companyName: string };

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
];

export default function Dashboard({
  initialCompanies,
  initialCadence,
}: {
  initialCompanies: Company[];
  initialCadence: Cadence;
}) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SymbolMatch[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cadence, setCadenceState] = useState<Cadence>(initialCadence);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Section 6.1: "Add company by ticker or name search" — search-as-you-type
  // against Finnhub symbol search, debounced so every keystroke doesn't fire
  // a request.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setSuggestions([]);
        return;
      }
      const res = await fetch(`/api/watchlist/search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) return;
      setSuggestions(await res.json());
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function addCompany(ticker: string, companyName?: string) {
    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, companyName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "failed to add ticker");
        return;
      }

      setCompanies((prev) => [...prev, data]);
      setQuery("");
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setAdding(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    await addCompany(query.trim());
  }

  async function handleSelectSuggestion(match: SymbolMatch) {
    await addCompany(match.ticker, match.companyName);
  }

  async function handleRemove(id: string) {
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
  }

  async function handleCadenceChange(value: Cadence) {
    setCadenceState(value);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cadence: value }),
    });
  }

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Investor News Digest
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage your watchlist and digest cadence.
        </p>

        <form onSubmit={handleAdd} className="relative mt-8 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Ticker or company name"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Add
          </button>

          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute top-full left-0 z-10 mt-1 w-full max-w-[calc(100%-4.5rem)] rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {suggestions.map((s) => (
                <li key={s.ticker}>
                  <button
                    type="button"
                    onMouseDown={() => handleSelectSuggestion(s)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <span className="text-black dark:text-zinc-50">{s.companyName}</span>
                    <span className="text-zinc-500">{s.ticker}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
          {companies.length === 0 && (
            <li className="py-3 text-sm text-zinc-500">No tickers yet.</li>
          )}
          {companies.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-3">
              <span className="text-sm text-black dark:text-zinc-50">
                <span className="font-medium">{c.company_name}</span>{" "}
                <span className="text-zinc-500">{c.ticker}</span>
              </span>
              <button
                onClick={() => handleRemove(c.id)}
                className="text-sm text-zinc-500 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <label htmlFor="cadence" className="block text-sm font-medium text-black dark:text-zinc-50">
            Digest cadence
          </label>
          <select
            id="cadence"
            value={cadence}
            onChange={(e) => handleCadenceChange(e.target.value as Cadence)}
            className="mt-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {CADENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </main>
    </div>
  );
}
