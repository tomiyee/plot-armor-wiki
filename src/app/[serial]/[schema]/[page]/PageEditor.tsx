'use client';

import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen } from '@fortawesome/free-solid-svg-icons';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { savePageContent } from './actions';

// MDEditor uses browser-only APIs; dynamic import with ssr:false prevents
// hydration mismatches in Next.js App Router.
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

export interface SectionData {
  id: number;
  name: string;
  content: string;
}

export interface FloaterRowData {
  id: number;
  label: string;
  content: string;
}

interface Props {
  serialSlug: string;
  schemaName: string;
  pageName: string;
  sections: SectionData[];
  /** null when the schema has no floater */
  floaterImageUrl: string | null | undefined;
  floaterRows: FloaterRowData[];
}

/**
 * Renders the page body in read mode and switches to an inline edit mode where
 * each section gets an MDEditor, and floater fields get plain text inputs.
 * On save, calls the `savePageContent` Server Action which writes via SCD Type 2.
 *
 * @example
 * <PageEditor
 *   serialSlug="one-piece"
 *   schemaName="Characters"
 *   pageName="Luffy"
 *   sections={[{ id: 1, name: 'Overview', content: '...' }]}
 *   floaterImageUrl="https://..."
 *   floaterRows={[{ id: 2, label: 'Age', content: '19' }]}
 * />
 */
export function PageEditor({
  serialSlug,
  schemaName,
  pageName,
  sections,
  floaterImageUrl,
  floaterRows,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);

  // Draft state — keyed by entity ID.
  const [draftSectionContent, setDraftSectionContent] = useState<Record<number, string>>(
    () => Object.fromEntries(sections.map((s) => [s.id, s.content])),
  );
  const [draftFloaterImageUrl, setDraftFloaterImageUrl] = useState<string>(
    floaterImageUrl ?? '',
  );
  const [draftFloaterRowContent, setDraftFloaterRowContent] = useState<Record<number, string>>(
    () => Object.fromEntries(floaterRows.map((r) => [r.id, r.content])),
  );

  const hasFloater = floaterImageUrl !== undefined;

  function handleCancel() {
    // Reset drafts back to last-saved values.
    setDraftSectionContent(Object.fromEntries(sections.map((s) => [s.id, s.content])));
    setDraftFloaterImageUrl(floaterImageUrl ?? '');
    setDraftFloaterRowContent(Object.fromEntries(floaterRows.map((r) => [r.id, r.content])));
    setIsEditing(false);
  }

  function handleSave() {
    startTransition(async () => {
      await savePageContent(
        serialSlug,
        schemaName,
        pageName,
        draftSectionContent,
        hasFloater ? (draftFloaterImageUrl.trim() || null) : null,
        hasFloater ? draftFloaterRowContent : {},
      );
      setIsEditing(false);
      router.refresh();
    });
  }

  // ── Read mode ────────────────────────────────────────────────────────────────
  const hasFloaterContent =
    hasFloater && (draftFloaterImageUrl || floaterRows.length > 0);

  if (!isEditing) {
    return (
      <div
        className={
          hasFloaterContent
            ? 'grid grid-cols-[1fr_280px] gap-8 items-start'
            : undefined
        }
      >
        <Box col className="gap-6">
          {sections.map((section) => {
            const content = draftSectionContent[section.id] ?? '';
            return (
              <Box key={section.id} col className="gap-2">
                <Text variant="h2">{section.name}</Text>
                {content ? (
                  <div className="prose prose-gray max-w-none text-gray-700">
                    <ReactMarkdown>{content}</ReactMarkdown>
                  </div>
                ) : (
                  <Text muted>No content yet.</Text>
                )}
              </Box>
            );
          })}

          <Box className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <FontAwesomeIcon icon={faPen} className="mr-1.5" />
              Edit page
            </Button>
          </Box>
        </Box>

        {hasFloaterContent && (
          <aside className="sticky top-6 rounded-lg border border-gray-200 bg-gray-50 p-4 flex flex-col gap-3">
            {draftFloaterImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draftFloaterImageUrl}
                alt="Floater image"
                className="w-full rounded object-cover"
              />
            )}

            {floaterRows.length > 0 && (
              <dl className="flex flex-col gap-2 text-sm">
                {floaterRows.map((row) => {
                  const content = draftFloaterRowContent[row.id] ?? '';
                  return (
                    <div key={row.id}>
                      <dt className="font-medium text-gray-600">{row.label}</dt>
                      <dd className="text-gray-800 whitespace-pre-wrap">
                        {content || <span className="text-gray-400">—</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </aside>
        )}
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  return (
    <Box col className="gap-6">
      {sections.map((section) => (
        <Box key={section.id} col className="gap-2">
          <Text variant="h2">{section.name}</Text>
          <div data-color-mode="light">
            <MDEditor
              value={draftSectionContent[section.id] ?? ''}
              onChange={(val) =>
                setDraftSectionContent((prev) => ({ ...prev, [section.id]: val ?? '' }))
              }
              height={300}
              preview="edit"
            />
          </div>
        </Box>
      ))}

      {hasFloater && (
        <Box col className="gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <Text variant="h3">Floater fields</Text>

          <Box col className="gap-1.5">
            <Label htmlFor="floater-image-url">Image URL</Label>
            <Input
              id="floater-image-url"
              value={draftFloaterImageUrl}
              onChange={(e) => setDraftFloaterImageUrl(e.target.value)}
              placeholder="https://…"
              disabled={isPending}
            />
          </Box>

          {floaterRows.map((row) => (
            <Box key={row.id} col className="gap-1.5">
              <Label htmlFor={`floater-row-${row.id}`}>{row.label}</Label>
              <Input
                id={`floater-row-${row.id}`}
                value={draftFloaterRowContent[row.id] ?? ''}
                onChange={(e) =>
                  setDraftFloaterRowContent((prev) => ({ ...prev, [row.id]: e.target.value }))
                }
                disabled={isPending}
              />
            </Box>
          ))}
        </Box>
      )}

      <Box className="gap-2">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="outline" onClick={handleCancel} disabled={isPending}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
