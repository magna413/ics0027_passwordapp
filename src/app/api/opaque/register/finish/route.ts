// src/app/api/opaque/register/finish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateCsrf } from '@/lib/csrf';
import { z } from 'zod';

const FinishSchema = z.object({
  email: z.string().email(),
  msg3: z.string(),           // registrationRecord (base64 string)
  wrappingSaltB64: z.string(), // iv/salt for EK derivation
  wrappedDEKB64: z.string(),   // iv||ct||tag (wrapped DEK)
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await validateCsrf(req);

    const body = FinishSchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    const userRecord = await prisma.user.findUnique({ where: { email } });

    // If user already has an OPAQUE record, do not overwrite
    if (userRecord && userRecord.opaqueRegistrationRecord) {
      // Return generic error to prevent user enumeration
      return NextResponse.json(
        { error: 'Registration failed. Please try again.' },
        { status: 400 }
      );
    }

    const opaqueData = {
      opaqueRegistrationRecord: body.msg3,
      wrappingSalt: Buffer.from(body.wrappingSaltB64, 'base64'),
      wrappedDEK: Buffer.from(body.wrappedDEKB64, 'base64'),
    };

    if (userRecord) {
      // Case 2: existing user, no OPAQUE record yet -> update
      await prisma.user.update({
        where: { email },
        data: opaqueData,
      });
    } else {
      // Case 3: user does not exist yet -> create
      await prisma.user.create({
        data: {
          email,
          ...opaqueData,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Registration finish failed' },
      { status: 400 }
    );
  }
}
