import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createServerSideClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabaseAuth = await createServerSideClient();
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Verify vendor
    const { data: vendor, error: vendorErr } = await supabase
      .from('vendors')
      .select('id')
      .eq('email', user.email)
      .single();

    if (vendorErr || !vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    // Get the specific PO with line items
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_line_items(*)')
      .eq('id', id)
      .eq('vendor_id', vendor.id)
      .single();

    if (poErr || !po) {
      return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    }

    return NextResponse.json({ po });
  } catch (err) {
    console.error('[get-po]', err);
    return NextResponse.json({ error: 'Failed to fetch PO' }, { status: 500 });
  }
}
