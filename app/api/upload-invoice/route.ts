import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createServerSideClient } from '@/lib/supabase-server';
import { getSFConnection } from '@/lib/salesforce';

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
      console.error('[upload-invoice] Auth error:', userErr);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service client for DB operations to bypass RLS
    const supabase = createServiceClient();

    // ── Parse multipart form ─────────────────────────────────────────────────
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const poId = formData.get('poId') as string | null;

    if (!file || !poId) return NextResponse.json({ error: 'Missing file or poId' }, { status: 400 });

    // ── Verify vendor mapping ────────────────────────────────────────────────
    const { data: vendor, error: vendorErr } = await supabase
      .from('vendors')
      .select('id')
      .eq('email', finalUser.email)
      .single();

    if (vendorErr || !vendor) {
      console.error('[upload-invoice] Vendor not found:', vendorErr);
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    // ── Get PO and verify ownership (vendor_id = vendor.id) ──────────────────
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id, sf_po_id, po_number, vendor_id')
      .eq('id', poId)
      .eq('vendor_id', vendor.id)
      .single();

    if (!po) {
      console.error('[upload-invoice] PO not found or unauthorized');
      return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    }

    // ── Upload to Supabase Storage ────────────────────────────────────────────
    const fileName = `${po.sf_po_id}/${Date.now()}_${file.name}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: storageData, error: storageErr } = await supabase.storage
      .from('invoices')
      .upload(fileName, buffer, {
        contentType: file.type || 'application/pdf',
        upsert: true,
      });

    if (storageErr) {
      console.error('[upload-invoice] storage error:', storageErr);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from('invoices').getPublicUrl(storageData.path);

    // ── Update invoice_url in Supabase ────────────────────────────────────────
    await supabase.from('purchase_orders').update({ invoice_url: publicUrl }).eq('id', poId);

    // ── Push to Salesforce as ContentVersion (Attachment) ────────────────────
    try {
      const conn = await getSFConnection();
      const base64Content = buffer.toString('base64');

      await conn.sobject('ContentVersion').create({
        Title: `Invoice_${po.po_number}_${file.name}`,
        PathOnClient: file.name,
        VersionData: base64Content,
        FirstPublishLocationId: po.sf_po_id,
      });
    } catch (sfErr) {
      // Non-fatal: portal still works even if SF attachment fails
      console.warn('[upload-invoice] SF attachment failed:', sfErr);
    }

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error('[upload-invoice]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
