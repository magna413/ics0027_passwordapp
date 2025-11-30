// src/app/api/opaque/change-password/finish/route.ts
// Password change with OPAQUE is done via re-registration (same as registration flow)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/db';
import { validateCsrf } from '@/lib/csrf';
import * as opaque from '@serenity-kit/opaque';
import { z } from 'zod';

const ChangePasswordFinishSchema = z.object({
  registrationRecord: z.string(),  // finishRegistration result from client
  serverChangePasswordStateId: z.cuid(), // nonce to identify change password state
  wrappingSaltB64: z.string(), // new salt for EK derivation
  wrappedDEKB64: z.string(),   // new wrapped DEK (iv||ct||tag)
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await validateCsrf(req);
    await opaque.ready;

    // Ensure user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = ChangePasswordFinishSchema.parse(await req.json());

    const stateRecord = await prisma.serverChangePasswordState.findFirst({
      where: { id: body.serverChangePasswordStateId },
    });

    if (!stateRecord || stateRecord.userId !== session.user.id) {
      return NextResponse.json({ error: 'Invalid change password state' }, { status: 400 });
    }

    // Update user's OPAQUE registration record and vault keys
    // (same as regular registration, just replacing existing record)
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        opaqueRegistrationRecord: body.registrationRecord,
        wrappingSalt: Buffer.from(body.wrappingSaltB64, 'base64'),
        wrappedDEK: Buffer.from(body.wrappedDEKB64, 'base64'),
      },
    });

    // Clean up state
    await prisma.serverChangePasswordState.delete({
      where: { id: stateRecord.id },
    });

    return NextResponse.json({ ok: true, message: 'Password changed successfully' });
  } catch (err: any) {
    console.error('OPAQUE /change-password/finish error:', err?.message || err);
    // Generic error to prevent information leakage
    return NextResponse.json(
      { error: 'Password change failed. Please try again.' },
      { status: 400 }
    );
  }
}
