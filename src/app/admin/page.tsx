import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";

const TOOLS = [
  {
    href: "/admin/text-migrations",
    title: "Text migrations",
    description:
      "Preview and apply rewrites of stored markdown syntax across the database.",
  },
  {
    href: "/admin/ingestion",
    title: "Chapter ingestion",
    description:
      "Review, edit, and apply the wiki proposals that /ingest-chapter wrote to .ingest/.",
  },
];

/** Index of site-level admin tools. */
export default function AdminIndexPage() {
  return (
    <PageContainer className="max-w-3xl py-12 flex flex-col gap-6">
      <Text variant="h1">Admin</Text>
      <ul className="flex flex-col gap-4">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="text-primary hover:underline">
              <Text variant="h3" as="span">
                {t.title}
              </Text>
            </Link>
            <Text muted>{t.description}</Text>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
