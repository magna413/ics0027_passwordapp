import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';
import { validateCsrf } from '@/lib/csrf';

export async function POST(req: NextRequest) {
  try {
    await validateCsrf(req);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Disable TOTP by clearing secret
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        mfaSecret: null,
      },
    });

    return NextResponse.json({
      message: 'TOTP disabled successfully',
      enabled: false,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Invalid CSRF') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
    }
    console.error('POST /api/totp/disable error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
