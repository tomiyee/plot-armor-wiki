import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db/index";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string | null;
    } & DefaultSession["user"];
  }
}

/** Fixed identity used for all preview-environment developer logins. */
export const PREVIEW_USER = {
  id: "preview-user",
  name: "Preview Tester",
  email: "preview@plotarmor.dev",
  username: "preview-tester",
} as const;

const isPreview = process.env.VERCEL_ENV === "preview";

/**
 * Auth.js v5 configuration with Google OAuth and Drizzle database sessions.
 *
 * In Vercel Preview environments, a `Credentials` provider ("Developer Login")
 * is also registered so contributors can authenticate without Google OAuth,
 * which does not support wildcard preview URLs. Preview login returns a fixed
 * user identity and uses JWT sessions; production uses database sessions.
 *
 * After sign-in, users with a null `username` are redirected to `/onboarding`.
 * The preview user has a hard-coded username to skip that step.
 *
 * @example
 * // In a Server Component or Server Action:
 * const session = await auth();
 * const userId = session?.user?.id;
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    ...(isPreview
      ? [
          Credentials({
            name: "Developer Login",
            credentials: {},
            async authorize() {
              // Double-check at runtime to prevent misuse if env is wrong.
              if (process.env.VERCEL_ENV !== "preview") return null;
              return PREVIEW_USER;
            },
          }),
        ]
      : []),
  ],
  // Credentials provider requires JWT sessions; keep database sessions in prod.
  session: { strategy: isPreview ? "jwt" : "database" },
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user }) {
      // Runs only when strategy is "jwt" (i.e. preview environments).
      // On first sign-in `user` is populated; persist id and username into
      // the token so the `session` callback can read them.
      if (user) {
        token.id = user.id;
        token.username =
          (user as typeof user & { username?: string | null }).username ?? null;
      }
      return token;
    },
    async session({ session, user, token }) {
      // Expose the database user id and username on the session for server-side use.
      if (session.user) {
        if (token) {
          // JWT strategy (preview): pull id and username from the JWT token.
          session.user.id = token.id as string;
          session.user.username = (token.username as string | null) ?? null;
        } else {
          // Database strategy (production): user is the database row.
          session.user.id = user.id;
          session.user.username =
            (user as typeof user & { username: string | null }).username ??
            null;
        }
      }
      return session;
    },
    async signIn() {
      // Always allow sign-in. Username gating is handled in middleware so
      // the database session is created before the onboarding redirect.
      return true;
    },
  },
});
