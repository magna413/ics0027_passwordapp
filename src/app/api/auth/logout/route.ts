import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // NextAuth handles session clearing via signOut callback
    // This is mainly a convenience endpoint; actual logout happens on client via signOut()
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
