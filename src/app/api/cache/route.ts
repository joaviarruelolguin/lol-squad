import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { cache } from '@/lib/riot';

export async function GET() {
  await connection();
  return NextResponse.json({
    cachedEntries: cache.size,
  });
}

export async function DELETE() {
  await connection();
  cache.clear();
  return NextResponse.json({ success: true, cachedEntries: 0 });
}
