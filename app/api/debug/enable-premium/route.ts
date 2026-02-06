import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST() {
  const device_id = 'localStorageから取得した値（仮）'

  await supabaseAdmin
    .from('user_entitlements')
    .update({
      plan: 'plus',
      can_create_classes: true,
      class_slots: 3,
    })
    .eq('device_id', device_id)

  return NextResponse.json({ ok: true })
}
