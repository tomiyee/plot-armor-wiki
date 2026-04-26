import { notFound } from 'next/navigation';
import { db } from '@/db/index';
import { serials, serialAuthors, volumes, chapters, pageSchemas, schemaSections, schemaFloaterRows } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
  addChapter, addVolume, deleteChapter, deleteVolume, renameChapter, renameVolume, updateSerialTypes,
  reorderVolumes, reorderAllChapters, updateSerialMetadata,
  addSchema, deleteSchema, renameSchema,
  addSection, deleteSection, renameSection, reorderSections,
  addFloaterRow, deleteFloaterRow, renameFloaterRow, reorderFloaterRows,
} from './actions';
import { Box } from '@/components/ui/box';
import { SerialEditor } from '@/components/SerialEditor';
import { SchemaManager } from '@/components/SchemaManager';
import { SerialMetadataEditor } from '@/components/SerialMetadataEditor';

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
      .select({
        id: schemaSections.id,
        schemaId: schemaSections.schemaId,
        name: schemaSections.name,
        displayOrder: schemaSections.displayOrder,
      })
      .from(schemaSections)
      .innerJoin(pageSchemas, eq(schemaSections.schemaId, pageSchemas.id))
      .where(and(isNull(schemaSections.deletedAt), eq(pageSchemas.serialId, serial.id)))
      .orderBy(schemaSections.displayOrder),
    db
      .select({
        id: schemaFloaterRows.id,
        schemaId: schemaFloaterRows.schemaId,
        label: schemaFloaterRows.label,
        displayOrder: schemaFloaterRows.displayOrder,
      })
      .from(schemaFloaterRows)
      .innerJoin(pageSchemas, eq(schemaFloaterRows.schemaId, pageSchemas.id))
      .where(and(isNull(schemaFloaterRows.deletedAt), eq(pageSchemas.serialId, serial.id)))
      .orderBy(schemaFloaterRows.displayOrder),
  ]);

  const chaptersByVolume: Record<number, { id: number; displayName: string; idx: number; volumeId: number }[]> = {};
  volumeList.forEach((v) => { chaptersByVolume[v.id] = []; });
  chapterList.forEach((c) => { chaptersByVolume[c.volumeId]?.push(c); });

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

  const updateMetadataForSerial = updateSerialMetadata.bind(null, serial.id);
  const addVolumeForSerial = addVolume.bind(null, serial.id);
  const addChapterForSerial = addChapter.bind(null, serial.id);
  const deleteChapterForSerial = deleteChapter.bind(null, serial.id);
  const deleteVolumeForSerial = deleteVolume.bind(null, serial.id);
  const renameChapterForSerial = renameChapter.bind(null, serial.id);
  const renameVolumeForSerial = renameVolume.bind(null, serial.id);
  const reorderVolumesForSerial = reorderVolumes.bind(null, serial.id);
  const reorderAllChaptersForSerial = reorderAllChapters.bind(null, serial.id);
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
        {/* Serial header with inline edit */}
        <SerialMetadataEditor
          title={serial.title}
          description={serial.description}
          splashArtUrl={serial.splashArtUrl}
          authors={authors.map((a) => a.name)}
          updateMetadataAction={updateMetadataForSerial}
        />

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
          reorderVolumesAction={reorderVolumesForSerial}
          reorderAllChaptersAction={reorderAllChaptersForSerial}
          updateSerialTypesAction={updateSerialTypesForSerial}
        />

        {/* Schema management */}
        <SchemaManager
          schemas={schemasWithDetails}
          serialSlug={serialSlug}
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
