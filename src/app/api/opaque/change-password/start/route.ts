// src/app/api/opaque/change-password/start/route.ts
// Password change with OPAQUE is done via re-registration with the new password
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/db';
import { validateCsrf } from '@/lib/csrf';
import * as opaque from '@serenity-kit/opaque';
import { z } from 'zod';

const ChangePasswordStartSchema = z.object({
  registrationRequest: z.string(),  // registration request from client with new password
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
      // User authenticated but not found in DB - critical error
      return NextResponse.json({ error: 'Session error. Please log in again.' }, { status: 401 });
    }

    const body = ChangePasswordStartSchema.parse(await req.json());

    // Get server setup for registration
    const serverSetup = process.env.OPAQUE_SERVER_SETUP;
    if (!serverSetup) {
      return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 500 });
    }

    // Start password change (re-registration) on server
    let registrationResponse: string;
    try {
      const result = opaque.server.createRegistrationResponse({
        serverSetup,
        userIdentifier: user.email,
        registrationRequest: body.registrationRequest,
      });
      registrationResponse = result.registrationResponse;
    } catch (opaqueErr: any) {
      return NextResponse.json(
        { error: 'Password change failed. Please try again.' },
        { status: 400 }
      );
    }

    // Store registration state for next request
    const stateRecord = await prisma.serverChangePasswordState.create({
      data: {
        userId: session.user.id,
        serverChangePasswordState: registrationResponse,
      },
    });

    return NextResponse.json({
      registrationResponse,
      serverChangePasswordStateId: stateRecord.id,
    });
  } catch (err: any) {
    // Generic error to prevent information leakage
    return NextResponse.json(
      { error: 'Password change failed. Please try again.' },
      { status: 400 }
    );
  }
}
