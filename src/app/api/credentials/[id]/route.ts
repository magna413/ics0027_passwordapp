// app/api/credentials/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/db';
import { deriveEK, unwrapDEK, encryptWithDEK, decryptWithDEK } from '@/lib/crypto';
import { validateCsrf } from '@/lib/csrf';
import { z } from 'zod';


export const revalidate = 0; // no caching


function toArray(buf?: Buffer | Uint8Array | null): number[] | undefined {
  return buf ? Array.from(new Uint8Array(buf)) : undefined;
}


async function getDEK(userId: string, masterPassword: string) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new Error('User not found');

  const ek = await deriveEK(masterPassword, new Uint8Array(u.wrappingSalt));

  // wrappedDEK format: [12-byte IV | payload]
  const wrapped = new Uint8Array(u.wrappedDEK);
  const iv = wrapped.slice(0, 12);
  const payload = wrapped.slice(12);

  return unwrapDEK(ek, payload, iv);
}

const CredentialSchema = z.object({
  masterPassword: z.string().min(1),
  title: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  url: z.string().url().max(2048).optional(),
  password: z.string().min(1).max(10000),
});

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const parsed = z.string().cuid().safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const credId = parsed.data;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cred = await prisma.credential.findFirst({
      where: { id: credId, userId: session.user.id },
      select: {
        id: true,
        title: true,
        username: true,
        url: true,
        ciphertext: true,
        iv: true,
        tag: true,
        aad: true,
        createdAt: true,
      },
    });

    if (!cred) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      id: cred.id,
      title: cred.title,
      username: cred.username,
      url: cred.url,
      createdAt: cred.createdAt,
      iv: toArray(cred.iv),
      ciphertext: toArray(cred.ciphertext),
      tag: toArray(cred.tag),
      aad: toArray((cred as any).aad),  // ✅ include AAD for client decryption
    });
  } catch (error) {
    console.error('GET /api/credentials/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await validateCsrf(req);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Client now sends iv+ciphertext (Uint8Array) instead of masterPassword+plaintext
    const Schema = z.object({
      title: z.string().min(1).max(255),
      username: z.string().min(1).max(255),
      url: z.string().url().max(2048).optional(),
      iv: z.array(z.number()).min(12),
      ciphertext: z.array(z.number()).min(16),
    });

    const { title, username, url, iv, ciphertext } = Schema.parse(await req.json());

    const rec = await prisma.credential.create({
      data: {
        userId: session.user.id,
        title,
        username,
        url: url ?? null,
        iv: Buffer.from(new Uint8Array(iv)),
        ciphertext: Buffer.from(new Uint8Array(ciphertext)),
        tag: Buffer.from(new Uint8Array(ciphertext).slice(-16)), // keep if you store separately
      },
      select: { id: true },
    });

    return NextResponse.json(rec, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('POST /api/credentials error:', error);
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    if (error?.message === 'Invalid CSRF') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
    }
    console.error('POST /api/credentials error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


export async function PUT(req: NextRequest) {
  try {
    // State-changing => enforce CSRF
    await validateCsrf(req);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = await req.json();

    // No masterPassword on server anymore
    const { credentialId, action } = z.object({
      credentialId: z.string(),
      action: z.enum(['decrypt', 'update']).optional(),   // 'decrypt' now means "return iv+ct"
    }).parse(body);

    const cred = await prisma.credential.findUnique({
      where: { id: credentialId },
      select: {
        id: true, userId: true,
        title: true, username: true, url: true, createdAt: true,
        iv: true, ciphertext: true
      }
    });

    if (!cred || cred.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // --- Client-side decrypt path: server returns iv + ciphertext only ---
    if (action === 'decrypt' || !action) {
      return NextResponse.json({
        id: cred.id,
        title: cred.title,
        username: cred.username,
        url: cred.url,
        createdAt: cred.createdAt,
        iv: Array.from(new Uint8Array(cred.iv as any)),
        ciphertext: Array.from(new Uint8Array(cred.ciphertext as any)),
      });
    }

    // --- Update path (optionally with new client-encrypted secret) ---
    if (action === 'update') {
      const { title, username, url, iv, ciphertext, tag } = z.object({
        title: z.string().min(1).max(255).optional(),
        username: z.string().min(1).max(255).optional(),
        url: z.string().url().max(2048).optional().nullable(),
        iv: z.array(z.number()).optional(),         // present if password changed client-side
        ciphertext: z.array(z.number()).optional(), // present if password changed client-side
        tag: z.array(z.number()).optional(),        // present if password changed client-side
      }).parse(body);

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (username !== undefined) updateData.username = username;
      if (url !== undefined) updateData.url = url;

      // If the client changed the password, we expect fresh iv+ciphertext+tag
      if (iv && ciphertext && tag) {
        const ivU8 = new Uint8Array(iv);
        const ctU8 = new Uint8Array(ciphertext);
        const tagU8 = new Uint8Array(tag);
        updateData.iv = Buffer.from(ivU8);
        updateData.ciphertext = Buffer.from(ctU8);
        updateData.tag = Buffer.from(tagU8);
      }

      await prisma.credential.update({
        where: { id: credentialId },
        data: updateData,
      });

      return NextResponse.json({ message: 'Credential updated successfully' });
    }

    // Fallback (shouldn’t reach)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Invalid CSRF') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    if (error instanceof Error) {
      console.error('PUT /api/credentials error:', error.message, error.stack);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('PUT /api/credentials error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


export async function DELETE(req: NextRequest) {
  try {
    await validateCsrf(req);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { credentialId } = z.object({
      credentialId: z.string(),
    }).parse(await req.json());

    const cred = await prisma.credential.findUnique({
      where: { id: credentialId },
      select: { userId: true },
    });

    if (!cred || cred.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.credential.delete({
      where: { id: credentialId },
    });

    return NextResponse.json({ message: 'Credential deleted successfully' });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Invalid CSRF') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
    }
    console.error('DELETE /api/credentials error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
