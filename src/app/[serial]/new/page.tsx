import { notFound } from "next/navigation";
import Link from "next/link";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { PageContainer } from "@/components/ui/PageContainer";
import { isSerialAdmin } from "@/lib/auth-guard";
import { NewPageForm } from "./NewPageForm";
import { getSerialBySlug } from "@/data/serials/queries";
import { getChapterCutoff } from "@/data/chapters/queries";
import { getNewPageFormData } from "./queries";

interface NewPagePageProps {
  /** Next.js dynamic route params containing the `serial` slug. */
  params: Promise<{ serial: string }>;
  /** Query params; `parentPageId` pre-selects the parent; `name` pre-fills the page name field. */
  searchParams: Promise<{ parentPageId?: string; name?: string }>;
}

/** Server Component for the new-page creation form. */
export default async function NewPagePage(props: NewPagePageProps) {
  const { params, searchParams } = props;
  const { serial: serialSlug } = await params;
  const { parentPageId: parentPageIdParam, name: nameParam } = await searchParams;
  const defaultParentPageId = parentPageIdParam
    ? parseInt(parentPageIdParam, 10)
    : undefined;
  const defaultName = nameParam || undefined;

  const serial = await getSerialBySlug(serialSlug);

  if (!serial) {
    notFound();
  }

  const adminStatus = await isSerialAdmin(serial.id);
  if (!adminStatus) {
    notFound();
  }

  const [{ readingChapterId }, { volumeList, chapterList, existingPages }] =
    await Promise.all([
      getChapterCutoff(serial.id),
      getNewPageFormData(serial.id),
    ]);

  const cutoffIdx = chapterList.find((c) => c.id === readingChapterId)?.idx ?? 0;
  const chapterIdxById = new Map(chapterList.map((c) => [c.id, c.idx]));
  const chapterLabelById = new Map(
    chapterList.map((c) => [c.id, `${serial.chapterType} ${c.displayName}`]),
  );

  // Annotate future pages with their intro chapter label so the similarity warning
  // can display "A page introduced in chapter X" without spoiling the name.
  const allExistingPages = existingPages.map((p) => {
    if (
      p.introChapterId !== null &&
      (chapterIdxById.get(p.introChapterId) ?? Infinity) > cutoffIdx
    ) {
      return { ...p, introChapterLabel: chapterLabelById.get(p.introChapterId) };
    }
    return p;
  });

  return (
    <main>
      <PageContainer className="max-w-lg">
        <Box col className="gap-8">
          {/* Breadcrumb */}
          <Text muted className="text-sm">
            <Link href={`/${serialSlug}`} className="hover:underline">
              {serial.title}
            </Link>
          </Text>

          <Text variant="h1" className="text-2xl">
            New page
          </Text>

          <NewPageForm
            serialSlug={serialSlug}
            chapterType={serial.chapterType}
            volumeList={volumeList}
            chapterList={chapterList}
            existingPages={allExistingPages}
            defaultParentPageId={defaultParentPageId}
            defaultIntroChapterId={readingChapterId ?? undefined}
            defaultName={defaultName}
          />
        </Box>
      </PageContainer>
    </main>
  );
}
