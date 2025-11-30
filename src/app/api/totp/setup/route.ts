import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { validateCsrf } from '@/lib/csrf';
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    await validateCsrf(req);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if TOTP is already enabled
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { mfaSecret: true },
    });

    if (user?.mfaSecret) {
      return NextResponse.json(
        { error: 'TOTP is already enabled. Disable it first if you want to set up a new one.' },
        { status: 400 }
      );
    }

    // Dynamically import otplib and qrcode to avoid type issues
    const { authenticator } = await import('otplib');
    const QRCode = await import('qrcode');

    // Generate TOTP secret using otplib
    const base32Secret = authenticator.generateSecret();

    if (!base32Secret) {
      throw new Error('Failed to generate TOTP secret');
    }

    // Build otpauth URL for QR code
    const otpauthURL = `otpauth://totp/Password%20Manager:${encodeURIComponent(session.user.email)}?secret=${base32Secret}&issuer=Password%20Manager`;

    // Generate QR code
    const qrCode = await QRCode.toDataURL(otpauthURL);

    // Return secret and QR code (NOT saved to DB yet - user must verify first)
    return NextResponse.json({
      secret: base32Secret,
      qrCode: qrCode,
      message: 'Scan QR code with authenticator app and verify the code',
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Invalid CSRF')) {
      console.error('POST /api/totp/setup error:', error);
      return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
    }
    console.error('POST /api/totp/setup error:', error);

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
