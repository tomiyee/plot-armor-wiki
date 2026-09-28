import Link from "next/link";
import { fetchAllSerials } from "@/data/serials/queries";
import SerialList from "@/components/SerialList";
import { Text } from "@/components/ui/Text";
import { PageContainer } from "@/components/ui/PageContainer";

export const dynamic = "force-dynamic";

export default async function Home() {
  const allSerials = await fetchAllSerials();

  return (
    <main className="flex-1 min-h-0 overflow-y-scroll flex flex-col items-center">
      <PageContainer className="flex flex-col items-center gap-6 py-16">
        <Text variant="h1">Find a wiki</Text>
        <Text muted className="text-center max-w-md">
          PlotArmor is a spoiler-safe wiki - every reader sets a chapter cutoff
          and sees only content up to that point.{" "}
          <Link
            href="/help#what-is-plotarmor"
            className="text-primary hover:underline"
          >
            What does that mean?
          </Link>
        </Text>
        <SerialList serials={allSerials} />
        <Link
          href="/new"
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Create wiki
        </Link>
      </PageContainer>
    </main>
  );
}
