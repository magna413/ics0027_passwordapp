import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/db';
import { validateCsrf } from '@/lib/csrf';
import { z } from 'zod';

const VerifySchema = z.object({
  // Allow 16–128 chars, strip spaces, uppercase for Base32
  secret: z
    .string()
    .min(16)
    .max(128)
    .transform((s) => s.replace(/\s+/g, '').toUpperCase()),
  // Strip non-digits and ensure exactly 6 left
  code: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => /^\d{6}$/.test(s), 'Code must be 6 digits'),
});

export async function POST(req: NextRequest) {
  try {
    await validateCsrf(req);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { secret, code } = VerifySchema.parse(body);

    // Dynamically import otplib to avoid type issues
    const { authenticator } = await import('otplib');

    // Verify TOTP code using otplib
    const verified = authenticator.check(code, secret);

    if (!verified) {
      return NextResponse.json(
        { error: 'Invalid TOTP code' },
        { status: 400 }
      );
    }

    // Save TOTP secret to database
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        mfaSecret: secret,
      },
    });

    return NextResponse.json({
      message: 'TOTP enabled successfully',
      enabled: true,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Invalid CSRF') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    console.error('POST /api/totp/verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
