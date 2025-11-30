// src/app/api/auth/totp-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateCsrf } from '@/lib/csrf';
import { z } from 'zod';

const VerifySchema = z.object({
  opaqueSessionId: z.string().cuid(),
  code: z.string().length(6),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await validateCsrf(req);
    const body = VerifySchema.parse(await req.json());

    // Find the OPAQUE session
    const opaqueSession = await prisma.opaqueSession.findUnique({
      where: { id: body.opaqueSessionId },
      include: { user: true },
    });

    if (!opaqueSession) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 400 }
      );
    }

    const user = opaqueSession.user;

    // Verify TOTP code
    if (!user.mfaSecret) {
      return NextResponse.json(
        { error: 'MFA not enabled for this user' },
        { status: 400 }
      );
    }

    const { authenticator } = await import('otplib');
    const verified = authenticator.check(body.code, user.mfaSecret);

    if (!verified) {
      return NextResponse.json(
        { error: 'Invalid TOTP code' },
        { status: 400 }
      );
    }

    // TOTP verified successfully - return the opaqueSessionId for client to use with NextAuth
    return NextResponse.json({
      ok: true,
      opaqueSessionId: body.opaqueSessionId,
    });
  } catch (err: any) {
    console.error('TOTP verify error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'TOTP verification failed' },
      { status: 400 }
    );
  }
}
