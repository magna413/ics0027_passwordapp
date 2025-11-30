import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { validateCsrf } from '@/lib/csrf';

export async function POST(req: NextRequest) {
  try {
    await validateCsrf(req);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const Bytes = z.instanceof(Uint8Array);
    const ByteArray = z
  .union([
    z.instanceof(Uint8Array),
    z.array(z.number().int().min(0).max(255)),
  ])
  .transform(v => v instanceof Uint8Array ? v : new Uint8Array(v));

    // Client now sends iv+ciphertext (Uint8Array) instead of masterPassword+plaintext
    const Schema = z.object({
  title: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  url: z.string().url().max(2048).optional(),
  iv: ByteArray.refine(b => b.length === 12, 'IV must be 12 bytes'),
  ciphertext: ByteArray, // may be length 0 if you allow empty plaintexts
  tag: ByteArray.refine(b => b.length === 16, 'GCM tag must be 16 bytes'),
  aad: ByteArray.optional(), // include only if you persist/require AAD
});
    
    const input = await req.json();
    const { title, username, url, iv, ciphertext, tag, aad } = Schema.parse(input);


    const rec = await prisma.credential.create({
      data: {
        userId: session.user.id,
        title,
        username,
        url: url ?? null,
        iv: Buffer.from(new Uint8Array(iv)),
        ciphertext: Buffer.from(new Uint8Array(ciphertext)),
        tag: Buffer.from(new Uint8Array(tag)),
        // Store AAD if you use it for encryption
        aad: aad ? Buffer.from(new Uint8Array(aad)) : null
      },
      select: { id: true },
    });

    return NextResponse.json(rec, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('POST /api/credentials error:', error);
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    if (error?.message.includes('Invalid request') || error?.message.includes('Invalid CSRF') || error === 'Invalid CSRF') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
    }
    console.error('POST /api/credentials error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const creds = await prisma.credential.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, username: true, url: true, createdAt: true }
    });
    if (!creds || creds.length === 0) {
      return NextResponse.json({ error: 'No credentials found' }, { status: 404 });
    }

    return NextResponse.json(creds);
  } catch (error) {
    console.error('GET /api/credentials error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}