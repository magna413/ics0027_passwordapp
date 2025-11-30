// src/app/api/opaque/login/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateCsrf } from '@/lib/csrf';
import * as opaque from '@serenity-kit/opaque';
import { base64, z } from 'zod';
import { randomBytes } from 'node:crypto';

const BodySchema = z.object({
  email: z.string().email(),
  msg1: z.string(), // startLoginRequest
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: any;
  const serverSetup = process.env.OPAQUE_SERVER_SETUP;

  try {
    await validateCsrf(req);
    await opaque.ready;

    body = BodySchema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    if (!serverSetup) throw new Error('OPAQUE_SERVER_SETUP is not configured');

    const user = await prisma.user.findUnique({ where: { email } });

    let loginResponse: string;
    let serverLoginStateId: string;

    if (!user || !user.opaqueRegistrationRecord) {
      // Generate dummy response to prevent timing attacks
      // Use a base64-encoded random record that might look like a valid OPAQUE record
      try {
        const dummyResult = opaque.server.startLogin({
          serverSetup,
          userIdentifier: email + '-dummy',
          registrationRecord: Buffer.from(randomBytes(200)).toString('base64'),
          startLoginRequest: body.msg1,
        });
        loginResponse = dummyResult.loginResponse;
      } catch {
        // If dummy registration record fails, generate a dummy response
        loginResponse = Buffer.from(randomBytes(384)).toString('base64');
      }
      // Return a fake state ID that won't be found (will fail at finish stage)
      serverLoginStateId = randomBytes(12).toString('hex');
    } else {
      // ---- OPAQUE: create loginResponse (msg2) ----
      const { serverLoginState, loginResponse: response } = opaque.server.startLogin({
        serverSetup,
        userIdentifier: email,
        registrationRecord: user.opaqueRegistrationRecord,
        startLoginRequest: body.msg1,
      });
      loginResponse = response;

      const resp = await prisma.serverLoginState.create({
        data: {
          userId: user.id,
          email: email,
          serverLoginState: serverLoginState,
        },
      });
      serverLoginStateId = resp.id;
    }

    return NextResponse.json({
      msg2: loginResponse,
      serverLoginStateId,
    });
  } catch (err: any) {
    // Generate dummy response even on unexpected errors
    if (serverSetup && body?.msg1) {
      try {
        const dummyResult = opaque.server.startLogin({
          serverSetup,
          userIdentifier: 'error-fallback',
          registrationRecord: Buffer.from(randomBytes(200)).toString('base64'),
          startLoginRequest: body.msg1,
        });
        return NextResponse.json({
          msg2: dummyResult.loginResponse,
          serverLoginStateId: randomBytes(12).toString('hex'),
        });
      } catch {
        // Even if dummy fails, return a valid-looking response (384 random bytes as base64)
        return NextResponse.json({
          msg2: Buffer.from(randomBytes(384)).toString('base64'),
          serverLoginStateId: randomBytes(12).toString('hex'),
        });
      }
    }
    // Final fallback (384 random bytes as base64)
    return NextResponse.json({
      msg2: Buffer.from(randomBytes(384)).toString('base64'),
      serverLoginStateId: randomBytes(12).toString('hex'),
    });
  }
}
