"use client";

import { useActionState } from "react";
import { setUsername, type UsernameActionState } from "./actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";

/**
 * Form that lets a new user pick their username after OAuth sign-in.
 * Uses useActionState so validation errors render inline without a full page reload.
 *
 * @example
 * <UsernameForm />
 */
export function UsernameForm() {
  const [state, formAction, isPending] = useActionState<
    UsernameActionState,
    FormData
  >(setUsername, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Box col className="gap-1">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          placeholder="e.g. reader_42"
          autoFocus
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore
        />
        <Text variant="label" muted className="text-xs">
          3–20 characters: letters, numbers, and underscores only.
        </Text>
        {state?.error && (
          <Text variant="label" className="text-xs text-red-500">
            {state.error}
          </Text>
        )}
      </Box>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Set username"}
      </Button>
    </form>
  );
}
