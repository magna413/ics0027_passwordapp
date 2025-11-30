import { type NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from './db';
import { check } from 'zod';


export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 60 * 30 }, // 30m
  providers: [
    
    Credentials({
      id: 'opaque',
      name: 'OPAQUE',
      credentials: { token: {}, totpCode: {} },

      async authorize(credentials) {
        const token_req = credentials?.token as string;
        const totpCode = credentials?.totpCode as string | undefined;
        if (!token_req) return null;

        // Clean up tokens older than 1 month
        const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        await prisma.opaqueSession.deleteMany({
          where: {
            createdAt: { lt: oneMonthAgo },
          },
        });

        // Find user by token

        const userRecord = await prisma.user.findFirst({
          where: {
            opaqueSessions: {
              some: {
                token: token_req,
                used: false,
              },
            },
          },
        });
        if (!userRecord) {
          return null;
        }

        if (userRecord.mfaSecret) {
          // TOTP code must be provided if MFA is enabled
          if (!totpCode) {
            return null;
          }

          // Verify TOTP code using otplib
          const { authenticator } = await import('otplib');
          const verified = authenticator.check(totpCode, userRecord.mfaSecret);

          if (!verified) {
            // Invalid TOTP code
            return null;
          }
        }
        // mark token as used
        await prisma.opaqueSession.updateMany({
          where: {
            userId: userRecord.id,
            token: token_req,
            used: false,
          },
          data: { used: true },
        });

        return { id: userRecord.id, email: userRecord.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
