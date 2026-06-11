import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";

/**
 * Static server-rendered documentation page for PlotArmor Wiki.
 * Covers core concepts, creating a wiki, editing content, and the suggestion workflow.
 * Linked from the Navbar and from contextual inline hints throughout the app.
 */
export default function HelpPage() {
  return (
    <main className="flex-1 min-h-0 overflow-y-scroll">
      <PageContainer className="max-w-2xl py-12 flex flex-col gap-10">
        {/* Page header */}
        <div>
          <Text variant="h1" className="mb-2">
            Help &amp; Documentation
          </Text>
          <Text muted>
            Everything you need to know about using PlotArmor Wiki - from
            reading spoiler-free to contributing as an editor.
          </Text>
        </div>

        {/* Quick-nav */}
        <nav aria-label="Help sections" className="flex flex-col gap-1.5">
          <Text
            variant="label"
            muted
            className="text-xs uppercase tracking-wider mb-1"
          >
            On this page
          </Text>
          <Link
            href="#what-is-plotarmor"
            className="text-sm text-primary hover:underline"
          >
            What is PlotArmor Wiki?
          </Link>
          <Link
            href="#core-concepts"
            className="text-sm text-primary hover:underline"
          >
            Core concepts
          </Link>
          <Link
            href="#creating-a-wiki"
            className="text-sm text-primary hover:underline"
          >
            Creating a wiki
          </Link>
          <Link
            href="#editing-content"
            className="text-sm text-primary hover:underline"
          >
            Editing content
          </Link>
          <Link
            href="#suggesting-edits"
            className="text-sm text-primary hover:underline"
          >
            Suggesting edits
          </Link>
          <Link
            href="#inline-citations"
            className="text-sm text-primary hover:underline"
          >
            Inline citations (ref / refbox)
          </Link>
        </nav>

        {/* ── Section 1 ──────────────────────────────────────────────────────── */}
        <section
          id="what-is-plotarmor"
          className="flex flex-col gap-3 scroll-mt-16"
        >
          <Text variant="h2">What is PlotArmor Wiki?</Text>
          <Text>
            PlotArmor Wiki is a spoiler-safe wiki platform for readers of
            ongoing serials - anime, manga, web novels, TV shows, or any
            chapter-based story.
          </Text>
          <Text>
            The core idea is simple: every reader sets a{" "}
            <strong>chapter cutoff</strong>. The wiki then shows only
            information that was introduced at or before that chapter. Pages,
            infobox entries, and section content that belong to later chapters
            are automatically hidden - so you can look up a character without
            seeing who they become three arcs later.
          </Text>
          <Text>
            Admins create and manage the wiki. Readers can follow along and,
            once signed in, suggest edits that admins review before going live.
          </Text>
        </section>

        {/* ── Section 2 ──────────────────────────────────────────────────────── */}
        <section
          id="core-concepts"
          className="flex flex-col gap-4 scroll-mt-16"
        >
          <Text variant="h2">Core concepts</Text>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Chapter cutoff</Text>
            <Text>
              Your chapter cutoff is the furthest chapter you have read. It is
              stored per serial and can be changed at any time via the chapter
              selector in the top navigation bar. Everything beyond your cutoff
              stays hidden.
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Serials</Text>
            <Text>
              A <em>serial</em> is the top-level container for a wiki - one
              serial per story (e.g. &ldquo;One Piece&rdquo; or &ldquo;Attack on
              Titan&rdquo;). Each serial has its own set of volumes, chapters,
              and wiki pages.
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Wiki pages and sections</Text>
            <Text>
              Wiki pages are the individual articles (characters, locations,
              factions, etc.). Each page is divided into{" "}
              <strong>sections</strong> - e.g. &ldquo;Summary&rdquo;,
              &ldquo;Appearance&rdquo;, &ldquo;Abilities&rdquo;. Every section
              can have different content at different chapters, so a
              character&rsquo;s summary is automatically updated as the story
              progresses without revealing anything to readers who haven&rsquo;t
              caught up.
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Infobox</Text>
            <Text>
              An infobox is the structured sidebar (or floater) on a wiki page
              showing key facts at a glance - things like age, occupation, or
              first appearance. Like sections, infobox rows are
              chapter-versioned.
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Wiki links</Text>
            <Text>
              Inside page content you can link to other wiki pages or chapters
              using the{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                [[page:Name]]
              </code>{" "}
              /{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                [[chapter:Name]]
              </code>{" "}
              syntax. See{" "}
              <Link
                href="#editing-content"
                className="text-primary hover:underline"
              >
                Editing content
              </Link>{" "}
              for the full syntax.
            </Text>
          </div>
        </section>

        {/* ── Section 3 ──────────────────────────────────────────────────────── */}
        <section
          id="creating-a-wiki"
          className="flex flex-col gap-4 scroll-mt-16"
        >
          <Text variant="h2">Creating a wiki</Text>
          <Text>
            Any signed-in user can create a new wiki by clicking{" "}
            <strong>Create wiki</strong> on the home page. You will be asked to
            fill in:
          </Text>

          <ul className="list-disc pl-5 flex flex-col gap-2 text-base">
            <li>
              <strong>Title</strong> - the name of the story.
            </li>
            <li>
              <strong>Description</strong> - a short Markdown-formatted
              description shown on the serial home page.
            </li>
            <li>
              <strong>Authors</strong> - the creator(s) of the original work.
            </li>
            <li>
              <strong>Volume type</strong> and <strong>Chapter type</strong> -
              these set the vocabulary used everywhere in the wiki. For a manga
              you might keep the defaults (&ldquo;Volume&rdquo; /
              &ldquo;Chapter&rdquo;). For an anime choose &ldquo;Season&rdquo; /
              &ldquo;Episode&rdquo;. For a web novel you might use
              &ldquo;Book&rdquo; / &ldquo;Chapter&rdquo;. Readers will see these
              labels in the chapter selector and chapter pages.
            </li>
            <li>
              <strong>Splash art URL</strong> - an optional cover image shown on
              the serial home page.
            </li>
          </ul>

          <Text>
            After creating the wiki you become its admin. You can then add
            volumes, chapters, and wiki pages from the serial home page.
          </Text>
        </section>

        {/* ── Section 4 ──────────────────────────────────────────────────────── */}
        <section
          id="editing-content"
          className="flex flex-col gap-4 scroll-mt-16"
        >
          <Text variant="h2">Editing content</Text>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Markdown</Text>
            <Text>
              Page sections and descriptions are written in{" "}
              <strong>Markdown</strong>. If you are not familiar with Markdown,{" "}
              <a
                href="https://www.markdownguide.org/basic-syntax/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                see the Markdown Basic Syntax guide
              </a>{" "}
              for a quick reference.
            </Text>
            <Text muted className="text-sm">
              Common formatting:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                **bold**
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                _italic_
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                # Heading
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                - list item
              </code>
              .
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Wiki link syntax</Text>
            <Text>
              To link to another wiki page or chapter, wrap the target in double
              brackets. Two prefixes are supported:
            </Text>
            <pre className="rounded-md bg-muted px-4 py-3 text-sm font-mono overflow-x-auto">
              {`[[Luffy]]              → page link (no prefix)\n[[page:Luffy]]         → explicit page link (same result)\n[[chapter:Water 7]]    → chapter link (use the serial's chapter type)\n[[Luffy|The Straw Hat]] → any form with a display-text alias`}
            </pre>
            <Text>
              The valid prefixes are{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                page:
              </code>{" "}
              for wiki pages and the serial&rsquo;s chapter type (e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                chapter:
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                episode:
              </code>
              ) for chapter links. The editor provides autocomplete suggestions
              as you type inside{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                [[
              </code>
              .
            </Text>
            <Text>
              <strong>Live links vs. frozen aliases.</strong> A link{" "}
              <em>without</em> an alias (e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                [[page:luffy]]
              </code>
              ) always renders the page&rsquo;s current title — if the page is
              renamed, every live link to it updates automatically. A link{" "}
              <em>with</em> an alias (e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                [[page:luffy|The Straw Hat]]
              </code>
              ) freezes the display text to whatever you typed; it will not
              change if the page is renamed. When using the{" "}
              <strong>Insert/Edit Wiki Link</strong> popover, leaving the alias
              field blank creates a live link (the default). Only fill in the
              alias field when you intentionally want a custom display name.
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Writing as of a chapter</Text>
            <Text>
              When editing, you choose a target chapter (&ldquo;Writing as
              of:&rdquo;). Your changes are saved at that chapter and will only
              be shown to readers who have reached it. This lets you update a
              character&rsquo;s page after a major story event without spoiling
              readers who haven&rsquo;t seen it yet.
            </Text>
          </div>
        </section>

        {/* ── Section 5 ──────────────────────────────────────────────────────── */}
        <section
          id="inline-citations"
          className="flex flex-col gap-4 scroll-mt-16"
        >
          <Text variant="h2">Inline citations (ref / refbox)</Text>
          <Text>
            You can cross-reference related pages and chapters inline with the
            ref system. Two syntaxes are supported:
          </Text>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Citing a source inline</Text>
            <Text>
              Use{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                {"{{ref|page:slug}}"}
              </code>{" "}
              or{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                {"{{ref|chapter:Name}}"}
              </code>{" "}
              anywhere in a sentence. It renders as a clickable superscript
              ordinal like{" "}
              <sup>
                <a href="#" className="text-primary">[1]</a>
              </sup>{" "}
              that links to the corresponding entry in the refbox.
            </Text>
            <pre className="rounded-md bg-muted px-4 py-3 text-sm font-mono overflow-x-auto">
              {`Luffy is the captain of the Straw Hat Pirates.{{ref|page:luffy}}\nNami joined after the Arlong Arc.{{ref|chapter:Chapter 8}}`}
            </pre>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Deduplication</Text>
            <Text>
              If you cite the same page or chapter more than once, all
              occurrences share the same ordinal number, assigned by first
              appearance in document order.
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Adding the reference list</Text>
            <Text>
              Place{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                {"{{refbox}}"}
              </code>{" "}
              on its own line where you want the numbered reference list to
              appear — typically at the bottom of a section. It is replaced at
              render time with an ordered list of all cited targets.
            </Text>
            <pre className="rounded-md bg-muted px-4 py-3 text-sm font-mono overflow-x-auto">
              {`== References ==\n\n{{refbox}}`}
            </pre>
            <Text muted className="text-sm">
              The{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                {"{{refbox}}"}
              </code>{" "}
              position is author-controlled and is not added automatically.
              Place it wherever a references section makes sense for your page.
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Editor support</Text>
            <Text>
              In the WYSIWYG editor, click the{" "}
              <strong>Insert reference</strong> toolbar button (bookmark icon) to
              open a page/chapter picker and insert a{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                {"{{ref|…}}"}
              </code>{" "}
              chip at the cursor. Clicking an existing ref chip reopens the
              picker so you can change the target. A live preview of the
              deduplicated reference list is shown wherever{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                {"{{refbox}}"}
              </code>{" "}
              appears in the editor.
            </Text>
          </div>
        </section>

        {/* ── Section 6 ──────────────────────────────────────────────────────── */}
        <section
          id="suggesting-edits"
          className="flex flex-col gap-4 scroll-mt-16"
        >
          <Text variant="h2">Suggesting edits</Text>
          <Text>
            Signed-in readers who are not wiki admins can still contribute by
            suggesting edits. Suggestions go through an admin review step before
            they appear on the wiki.
          </Text>

          <div className="flex flex-col gap-2">
            <Text variant="h3">How to suggest an edit to a wiki page</Text>
            <ol className="list-decimal pl-5 flex flex-col gap-1.5 text-base">
              <li>Sign in to your PlotArmor account.</li>
              <li>
                Navigate to the wiki page you want to improve and click{" "}
                <strong>Suggest an edit</strong>.
              </li>
              <li>
                Choose the target chapter - this limits your suggestion to
                content visible to readers at or before that chapter.
              </li>
              <li>Edit the section content and/or infobox rows.</li>
              <li>
                Fill in the <strong>Citation</strong> field with a quote, page
                number, or episode timestamp that supports your changes.
              </li>
              <li>
                Click <strong>Submit suggestion</strong>.
              </li>
            </ol>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">
              How to suggest an edit to a chapter synopsis
            </Text>
            <Text>
              On any chapter page, click{" "}
              <strong>Suggest an edit to the synopsis</strong>, write your
              proposed synopsis, and submit. An admin will review it.
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">What happens after you submit</Text>
            <Text>
              Your suggestion enters a <em>pending</em> state. A wiki admin will
              review the proposed changes and either approve or reject them. You
              can check the status on the same page where you submitted - a
              banner will appear showing whether your suggestion is pending,
              approved, or rejected, along with any admin note.
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Text variant="h3">Admin review</Text>
            <Text>
              Admins see a review panel below each page listing all pending
              suggestions with a side-by-side diff of the current and proposed
              content. They can approve (which applies the changes to the wiki
              at the target chapter) or reject (with an optional note to the
              contributor).
            </Text>
          </div>
        </section>
      </PageContainer>
    </main>
  );
}
