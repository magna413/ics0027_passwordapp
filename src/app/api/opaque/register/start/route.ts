// POST /api/opaque/register/start
// body: { email, msg1 /* registrationRequest from client */ }

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateCsrf } from '@/lib/csrf';
import * as opaque from '@serenity-kit/opaque';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';

const BodySchema = z.object({
  email: z.string().email(),
  msg1: z.string(), // registrationRequest from client
  // wrappingSaltB64, wrappedDEKB64 etc can be added later if needed
});

type Body = z.infer<typeof BodySchema>;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const serverSetup = process.env.OPAQUE_SERVER_SETUP;
  let body: Body | null = null;

  try {
    await validateCsrf(req);

    body = BodySchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    // ⬇️ Hard fail if OPAQUE is not configured
    if (!serverSetup) {
      return NextResponse.json(
        { error: 'OPAQUE is not configured on this server' },
        { status: 500 }
      );
    }

    // Check if user already exists with finalized OPAQUE record
    const existing = await prisma.user.findUnique({ where: { email } });

    let registrationResponse: string;

    if (existing?.opaqueRegistrationRecord) {
      // Dummy response to keep timing behaviour consistent
      const dummyResult = opaque.server.createRegistrationResponse({
        serverSetup,
        userIdentifier: `${email}-dummy`,
        registrationRequest: body.msg1,
      });
      registrationResponse = dummyResult.registrationResponse;
    } else {
      // New registration or user without OPAQUE record
      try {
        const result = opaque.server.createRegistrationResponse({
          serverSetup,
          userIdentifier: email,
          registrationRequest: body.msg1,
        });
        registrationResponse = result.registrationResponse;
      } catch (opaqueErr: any) {
        // Dummy response even on OPAQUE error
        const dummyResult = opaque.server.createRegistrationResponse({
          serverSetup,
          userIdentifier: `${email}-error`,
          registrationRequest: body.msg1,
        });
        registrationResponse = dummyResult.registrationResponse;
      }
    }

    // Always return 200 with same response structure (when OPAQUE is configured)
    return NextResponse.json({ msg2: registrationResponse });
  } catch (err: any) {
    // Handle Zod validation errors (invalid email, missing fields, etc.)
    if (err instanceof z.ZodError) {
      const fieldErrors = err.issues.map((issue: any) => {
        if (issue.path[0] === 'email') {
          return 'Invalid email address format';
        }
        return `Invalid ${issue.path[0]}`;
      });
      return NextResponse.json(
        { error: fieldErrors[0] || 'Invalid request data' },
        { status: 400 }
      );
    }

    // If serverSetup is missing, we already returned 500 above,
    // so this catch only runs when serverSetup is defined OR we failed before that check.

    // Try to generate a dummy OPAQUE response if we can
    if (serverSetup && body?.msg1) {
      try {
        const dummyResult = opaque.server.createRegistrationResponse({
          serverSetup,
          userIdentifier: 'error-fallback',
          registrationRequest: body.msg1,
        });

        return NextResponse.json({
          msg2: dummyResult.registrationResponse,
        });
      } catch (opaqueErr: any) {
        // Failed to generate fallback, will use final fallback below
      }
    }

    // Final fallback – random bytes that *look* like an OPAQUE response (base64)
    const randomMsg2 = Buffer.from(randomBytes(384)).toString('base64');

    return NextResponse.json({
      msg2: randomMsg2,
    });
  }
}
