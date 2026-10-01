"use client";

import { ButtonWithTooltip, insertDecoratorNode$, usePublisher } from "@mdxeditor/editor";
import { ListTree } from "lucide-react";
import { CellListNode } from "./CellListNode";

/**
 * Toolbar button that inserts an empty `{{list:…}}` node at the cursor.
 * Meant for table cells, where normal markdown lists cannot go; the node's
 * edit popover opens immediately so the author can type the bullets.
 */
export function InsertCellListButton() {
  const insertDecoratorNode = usePublisher(insertDecoratorNode$);
  return (
    <ButtonWithTooltip
      title="Insert bulleted list in table cell"
      onClick={() => insertDecoratorNode(() => new CellListNode())}
    >
      <ListTree className="size-4" />
    </ButtonWithTooltip>
  );
}
