import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createServerSideClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const supabaseAuth = await createServerSideClient();
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Get the vendor for this user
    const { data: vendor, error: vendorErr } = await supabase
      .from('vendors')
      .select('id')
      .eq('email', user.email)
      .single();

    if (vendorErr || !vendor) {
      return NextResponse.json({ pos: [] }); // No vendor yet, so no POs
    }

    // Get the POs for this vendor with line items joined
    const { data: pos, error: posErr } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_line_items(*)')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });

    if (posErr) {
      throw posErr;
    }

    return NextResponse.json({ pos: pos ?? [] });
  } catch (err) {
    console.error('[get-pos]', err);
    return NextResponse.json({ error: 'Failed to fetch POs' }, { status: 500 });
  }
}
