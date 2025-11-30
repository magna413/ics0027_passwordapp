import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/db';

/**
 * Returns the wrappingSalt and wrappedDEK for the current user.
 * These are used by autoUnlockAfterLogin() to derive the DEK.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // adjust table/model name if yours differs
  const vaultKey = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      wrappingSalt: true,
      wrappedDEK: true,
    },
  });

  if (!vaultKey) {
    return NextResponse.json({ error: 'Vault key not found' }, { status: 404 });
  }

  // return as base64 so the client can b64-decode
  const toB64 = (v: Buffer | Uint8Array) =>
    Buffer.from(v as any).toString('base64');

  return NextResponse.json({
    wrappingSalt: toB64(vaultKey.wrappingSalt),
    wrappedDEK: toB64(vaultKey.wrappedDEK),
  });
}
