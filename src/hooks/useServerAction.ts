'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Wraps server actions in a transition that automatically refreshes the router
 * on completion, keeping server state in sync with client UI.
 *
 * `run` accepts a `FormData`-taking server action (used by form-based callsites).
 * `runAsync` accepts a plain thunk `() => Promise<{ error?: string } | void>` for
 * typed-argument server actions — covers suggestion, review, and editor callsites
 * that cannot pass FormData.
 *
 * @example
 * const { run, runAsync, isPending } = useServerAction();
 * // FormData-based:
 * run(deleteAction, formData, () => setDialogOpen(false));
 * // Typed-argument thunk:
 * runAsync(() => saveContent(pageId, draft), () => setEditing(false), (err) => setError(err));
 */
export function useServerAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(
    action: (fd: FormData) => Promise<void>,
    fd: FormData,
    onDone?: () => void,
    onError?: (error: Error) => void,
  ) {
    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        onDone?.();
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  function runAsync(
    action: () => Promise<{ error?: string } | void>,
    onDone?: () => void,
    onError?: (error: string) => void,
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result && result.error) {
          onError?.(result.error);
        } else {
          router.refresh();
          onDone?.();
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return { run, runAsync, isPending };
}
