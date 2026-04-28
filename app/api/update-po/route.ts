import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createServerSideClient } from '@/lib/supabase-server';
import { getSFConnection } from '@/lib/salesforce';

interface UpdatePayload {
  poId: string; // Supabase UUID
  deliveryStatus: string;
  expectedDeliveryDate?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAuth = await createServerSideClient();
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();

    let finalUser = user;
    if ((userErr || !user) && token) {
      const { data: tokenData } = await supabaseAuth.auth.getUser(token);
      finalUser = tokenData.user;
    }

    if (!finalUser) {
      console.error('[update-po] Auth error:', userErr);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service client for DB operations to bypass RLS
    const supabase = createServiceClient();

    // ── Parse body ───────────────────────────────────────────────────────────
    const body: UpdatePayload = await req.json();
    const { poId, deliveryStatus, expectedDeliveryDate } = body;

    if (!poId || !deliveryStatus) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // ── Verify this PO belongs to the user (vendor_id = user.id) ─────────────
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .select('id, sf_po_id, vendor_id')
      .eq('id', poId)
      .eq('vendor_id', finalUser.id)
      .single();

    if (poErr || !po) {
      console.error('[update-po] PO not found or unauthorized:', poErr);
      return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    }

    // ── Update Supabase ───────────────────────────────────────────────────────
    const updates: Record<string, unknown> = {
      delivery_status: deliveryStatus,
      updated_at: new Date().toISOString(),
    };
    if (expectedDeliveryDate !== undefined) {
      updates.expected_delivery_date = expectedDeliveryDate;
    }

    await supabase.from('purchase_orders').update(updates).eq('id', poId);

    // ── Write back to Salesforce ──────────────────────────────────────────────
    const conn = await getSFConnection();
    const sfUpdates: Record<string, unknown> = {
      Id: po.sf_po_id,
      Vendor_Delivery_Status__c: deliveryStatus,
    };
    if (expectedDeliveryDate) {
      sfUpdates.Expected_Delivery_Date__c = expectedDeliveryDate;
    }

    await conn.sobject('Purchase_Order__c').update(sfUpdates);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[update-po]', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
