import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/db/index";
import { serials, pageSchemas, pages, chapters } from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { buttonVariants } from "@/components/ui/button";
import { updateSchema } from "../actions";
import { SchemaIndexEditor } from "./SchemaIndexEditor";

interface Props {
  params: Promise<{ serial: string; schema: string }>;
}

async function getChapterCutoffIdx(serialId: number): Promise<number> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serialId}`)?.value;
  if (!raw) return 0;

  const chapterId = parseInt(raw, 10);
  if (isNaN(chapterId)) return 0;

  const [row] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  return row?.idx ?? 0;
}

export default async function SchemaIndexPage({ params }: Props) {
  const { serial: serialSlug, schema: schemaSlug } = await params;

  const schemaName = decodeURIComponent(schemaSlug);

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [schema] = await db
    .select()
    .from(pageSchemas)
    .where(
      and(
        eq(pageSchemas.serialId, serial.id),
        eq(pageSchemas.name, schemaName),
      ),
    )
    .limit(1);

  if (!schema) {
    notFound();
  }

  const cutoffIdx = await getChapterCutoffIdx(serial.id);

  const pageList = await db
    .select({ id: pages.id, name: pages.name })
    .from(pages)
    .innerJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(and(eq(pages.schemaId, schema.id), lte(chapters.idx, cutoffIdx)))
    .orderBy(pages.name);

  const updateSchemaForSerial = updateSchema.bind(null, serial.id);

  return (
    <main className="flex flex-col items-center px-6 py-16 gap-8">
      <Box col className="w-full max-w-2xl gap-6">
        <Text muted className="text-sm">
          <Link href={`/${serialSlug}`} className="hover:underline">
            {serial.title}
          </Link>
        </Text>

        <SchemaIndexEditor
          schemaId={schema.id}
          initialName={schema.name}
          initialBody={schema.body}
          serialSlug={serialSlug}
          updateSchemaAction={updateSchemaForSerial}
        />

        <Box col className="gap-3">
          <Box className="flex items-center justify-between">
            <Text variant="h2">Pages</Text>
            <Link
              href={`/${serialSlug}/${encodeURIComponent(schema.name)}/new`}
              className={buttonVariants({ size: "sm" })}
            >
              New page
            </Link>
          </Box>
          {pageList.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {pageList.map((page) => (
                <li key={page.id}>
                  <Link
                    href={`/${serialSlug}/${encodeURIComponent(schema.name)}/${encodeURIComponent(page.name)}`}
                    className="text-blue-600 hover:underline"
                  >
                    {page.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Text muted>No pages yet.</Text>
          )}
        </Box>
      </Box>
    </main>
  );
}
