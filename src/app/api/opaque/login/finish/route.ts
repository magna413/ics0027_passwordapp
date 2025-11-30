// src/app/api/opaque/login/finish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateCsrf } from '@/lib/csrf';
import * as opaque from '@serenity-kit/opaque';
import { z } from 'zod';
import { AuditAction, getClientIp, getUserAgent, logAuditEvent } from '@/lib/audit';
import { createHash } from 'crypto';

const FinishSchema = z.object({
  msg3: z.string().base64url(),  // finishLoginRequest from client
  serverLoginStateId: z.cuid(), // nonce to identify login state
});


export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);
    await validateCsrf(req);
    await opaque.ready;

    const resp = await req.json();

    const body = FinishSchema.parse(resp);


    const serverLoginStateRecord = await prisma.serverLoginState.findFirst({
      where: { id: body.serverLoginStateId },
    });

    // Default response structure for constant-time responses
    let responseData = {
      ok: false,
      pendingMfa: false,
    };
    let sessionKey: string | null = null;

    // Validate login state record exists
    if (serverLoginStateRecord && serverLoginStateRecord.serverLoginState) {
      // Complete OPAQUE login
      try {
        const result = opaque.server.finishLogin({
          finishLoginRequest: body.msg3,
          serverLoginState: serverLoginStateRecord.serverLoginState,
        });
        sessionKey = result.sessionKey;
        responseData.ok = true;
      } catch (opaqueErr: any) {
        // Still return 200 to prevent timing attacks
        sessionKey = null;
      }
    } else {
      // Still return 200 to prevent timing attacks
      sessionKey = null;
    }

    // Only proceed with session creation if login succeeded
    if (sessionKey && serverLoginStateRecord?.userId) {
      // Log successful password check
      await logAuditEvent(
        serverLoginStateRecord.userId,
        AuditAction.LOGIN_SUCCESSFUL,
        ip,
        userAgent
      );

      const loginToken = createHash('sha256').update(sessionKey).digest('base64');

      // Set session to expire in 5 minutes
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      try {
        await prisma.opaqueSession.create({
          data: {
            userId: serverLoginStateRecord.userId,
            token: loginToken,
            expiresAt,
          },
        });

        // Check MFA requirement
        const user = await prisma.user.findUnique({
          where: { id: serverLoginStateRecord.userId },
        });
        responseData.pendingMfa = !!user?.mfaSecret;
      } catch (dbErr: any) {
        responseData.ok = false;
      }
    }

    // Always return 200 with same response structure
    return NextResponse.json(responseData);
  } catch (err: any) {
    // Always return 200 even on unexpected errors to prevent timing attacks
    return NextResponse.json({
      ok: false,
      pendingMfa: false,
    });
  }
}
