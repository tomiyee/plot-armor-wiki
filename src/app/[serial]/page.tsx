import { notFound } from 'next/navigation';
import { db } from '@/db/index';
import { serials, serialAuthors, volumes, chapters, pageSchemas, schemaSections, schemaFloaterRows } from '@/db/schema';
import { eq, isNull } from 'drizzle-orm';
import {
  addChapter, addVolume, deleteChapter, deleteVolume, renameChapter, renameVolume, updateSerialTypes,
  addSchema, deleteSchema, renameSchema,
  addSection, deleteSection, renameSection, reorderSections,
  addFloaterRow, deleteFloaterRow, renameFloaterRow, reorderFloaterRows,
} from './actions';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { SerialEditor } from '@/components/SerialEditor';
import { SchemaManager } from '@/components/SchemaManager';

interface Props {
  params: Promise<{ serial: string }>;
}

export default async function SerialPage({ params }: Props) {
  const { serial: serialSlug } = await params;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [authors, volumeList, chapterList, schemaList, sectionList, floaterRowList] = await Promise.all([
    db
      .select()
      .from(serialAuthors)
      .where(eq(serialAuthors.serialId, serial.id))
      .orderBy(serialAuthors.displayOrder),
    db
      .select()
      .from(volumes)
      .where(eq(volumes.serialId, serial.id))
      .orderBy(volumes.idx),
    db
      .select({
        id: chapters.id,
        displayName: chapters.displayName,
        idx: chapters.idx,
        volumeId: chapters.volumeId,
      })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(eq(volumes.serialId, serial.id))
      .orderBy(chapters.idx),
    db
      .select()
      .from(pageSchemas)
      .where(eq(pageSchemas.serialId, serial.id))
      .orderBy(pageSchemas.id),
    db
      .select()
      .from(schemaSections)
      .where(isNull(schemaSections.deletedAt))
      .orderBy(schemaSections.displayOrder),
    db
      .select()
      .from(schemaFloaterRows)
      .where(isNull(schemaFloaterRows.deletedAt))
      .orderBy(schemaFloaterRows.displayOrder),
  ]);

  const chaptersByVolume: Record<number, { id: number; displayName: string; idx: number; volumeId: number }[]> = {};
  volumeList.forEach((v) => { chaptersByVolume[v.id] = []; });
  chapterList.forEach((c) => { chaptersByVolume[c.volumeId]?.push(c); });

  // Build schemas with their sections and floater rows
  const schemaIds = new Set(schemaList.map((s) => s.id));
  const sectionsBySchema: Record<number, typeof sectionList> = {};
  const floaterRowsBySchema: Record<number, typeof floaterRowList> = {};
  schemaIds.forEach((id) => { sectionsBySchema[id] = []; floaterRowsBySchema[id] = []; });
  sectionList.forEach((s) => { if (sectionsBySchema[s.schemaId]) sectionsBySchema[s.schemaId].push(s); });
  floaterRowList.forEach((r) => { if (floaterRowsBySchema[r.schemaId]) floaterRowsBySchema[r.schemaId].push(r); });

  const schemasWithDetails = schemaList.map((schema) => ({
    ...schema,
    sections: sectionsBySchema[schema.id] ?? [],
    floaterRows: floaterRowsBySchema[schema.id] ?? [],
  }));

  const addVolumeForSerial = addVolume.bind(null, serial.id);
  const addChapterForSerial = addChapter.bind(null, serial.id);
  const deleteChapterForSerial = deleteChapter.bind(null, serial.id);
  const deleteVolumeForSerial = deleteVolume.bind(null, serial.id);
  const renameChapterForSerial = renameChapter.bind(null, serial.id);
  const renameVolumeForSerial = renameVolume.bind(null, serial.id);
  const updateSerialTypesForSerial = updateSerialTypes.bind(null, serial.id);

  const addSchemaForSerial = addSchema.bind(null, serial.id);
  const deleteSchemaForSerial = deleteSchema.bind(null, serial.id);
  const renameSchemaForSerial = renameSchema.bind(null, serial.id);
  const addSectionForSerial = addSection.bind(null, serial.id);
  const deleteSectionForSerial = deleteSection.bind(null, serial.id);
  const renameSectionForSerial = renameSection.bind(null, serial.id);
  const reorderSectionsForSerial = reorderSections.bind(null, serial.id);
  const addFloaterRowForSerial = addFloaterRow.bind(null, serial.id);
  const deleteFloaterRowForSerial = deleteFloaterRow.bind(null, serial.id);
  const renameFloaterRowForSerial = renameFloaterRow.bind(null, serial.id);
  const reorderFloaterRowsForSerial = reorderFloaterRows.bind(null, serial.id);

  return (
    <main className="flex flex-col items-center px-6 py-16 gap-8">
      <Box col className="w-full max-w-2xl gap-4">
        {/* Serial header */}
        <Box col className="gap-2">
          <Text variant="h1">{serial.title}</Text>
          {authors.length > 0 && (
            <Text muted>{authors.map((a) => a.name).join(', ')}</Text>
          )}
          {serial.description && (
            <Text className="mt-1">{serial.description}</Text>
          )}
        </Box>

        {/* Volume and chapter list with edit mode */}
        <SerialEditor
          volumes={volumeList}
          chaptersByVolume={chaptersByVolume}
          chapterType={serial.chapterType}
          volumeType={serial.volumeType}
          addChapterAction={addChapterForSerial}
          addVolumeAction={addVolumeForSerial}
          deleteChapterAction={deleteChapterForSerial}
          deleteVolumeAction={deleteVolumeForSerial}
          renameChapterAction={renameChapterForSerial}
          renameVolumeAction={renameVolumeForSerial}
          updateSerialTypesAction={updateSerialTypesForSerial}
        />

        {/* Schema management */}
        <SchemaManager
          schemas={schemasWithDetails}
          addSchemaAction={addSchemaForSerial}
          deleteSchemaAction={deleteSchemaForSerial}
          renameSchemaAction={renameSchemaForSerial}
          addSectionAction={addSectionForSerial}
          deleteSectionAction={deleteSectionForSerial}
          renameSectionAction={renameSectionForSerial}
          reorderSectionsAction={reorderSectionsForSerial}
          addFloaterRowAction={addFloaterRowForSerial}
          deleteFloaterRowAction={deleteFloaterRowForSerial}
          renameFloaterRowAction={renameFloaterRowForSerial}
          reorderFloaterRowsAction={reorderFloaterRowsForSerial}
        />
      </Box>
    </main>
  );
}
