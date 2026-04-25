import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center px-6 py-16 gap-6">
      <h1 className="text-3xl font-bold">Find a wiki</h1>
      <input
        type="search"
        placeholder="Search serials…"
        className="w-full max-w-md rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
      />
      <Link
        href="/new"
        className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Create wiki
      </Link>
    </main>
  );
}
