import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

// Listar chats (resumen)
export async function GET() {
  await connection();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ chats: [] });
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('ai_chats')
      .select('id, title, match_id, created_at, updated_at, messages')
      .eq('user_id', 'squad')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    const chats = (data || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      matchId: c.match_id,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      messageCount: Array.isArray(c.messages) ? c.messages.length : 0,
    }));

    return NextResponse.json({ chats });
  } catch (err) {
    return NextResponse.json({ chats: [] });
  }
}

// Cargar un chat completo
export async function POST(req: Request) {
  await connection();
  try {
    const body = await req.json();
    const { chatId } = body;
    if (!chatId) {
      return NextResponse.json({ error: 'Falta chatId' }, { status: 400 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ chat: null });
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('ai_chats')
      .select('*')
      .eq('id', chatId)
      .eq('user_id', 'squad')
      .single();

    if (error || !data) {
      return NextResponse.json({ chat: null });
    }

    return NextResponse.json({
      chat: {
        id: data.id,
        title: data.title,
        matchId: data.match_id,
        messages: data.messages || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (err) {
    return NextResponse.json({ chat: null });
  }
}

// Eliminar un chat
export async function DELETE(req: Request) {
  await connection();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Falta id' }, { status: 400 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: true });
    }
    const supabase = getSupabase();
    await supabase.from('ai_chats').delete().eq('id', id).eq('user_id', 'squad');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false });
  }
}
