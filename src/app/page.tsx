import Link from 'next/link';
import { db } from '@/db/index';
import { serials } from '@/db/schema';
import SerialList from '@/components/SerialList';

export default async function Home() {
  const allSerials = await db.select().from(serials);

  return (
    <main className="flex flex-col items-center px-6 py-16 gap-6">
      <h1 className="text-3xl font-bold">Find a wiki</h1>
      <SerialList serials={allSerials} />
      <Link
        href="/new"
        className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Create wiki
      </Link>
    </main>
  );
}
