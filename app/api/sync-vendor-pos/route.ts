import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createServerSideClient } from '@/lib/supabase-server';
import { getSFConnection } from '@/lib/salesforce';

export async function POST(req: NextRequest) {
  try {
    // ── Step 1: Authenticate user ─────────────────────────────────────────────
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
      console.error('[sync-vendor-pos] Auth failed:', userErr);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    console.log('[sync-vendor-pos] Authenticated user:', finalUser.email);

    // ── Step 2: Connect to Salesforce ─────────────────────────────────────────
    console.log('[sync-vendor-pos] Connecting to Salesforce...');
    const conn = await getSFConnection();

    // ── Step 3: Fetch Account (vendor) from SF by Email__c ───────────────────
    console.log(`[sync-vendor-pos] Fetching SF Account for Email__c = '${finalUser.email}'...`);
    const accountResult = await conn.query<{
      Id: string;
      Name: string;
      Email__c: string;
    }>(
      `SELECT Id, Name, Email__c
       FROM Account
       WHERE Email__c = '${finalUser.email}'
       LIMIT 1`
    );

    const sfAccount = accountResult.records?.[0] ?? null;
    console.log('[sync-vendor-pos] SF Account found:', sfAccount);

    if (!sfAccount) {
      console.warn(`[sync-vendor-pos] No SF Account found for email: ${finalUser.email}`);
      return NextResponse.json({ error: 'No Salesforce account found for this email' }, { status: 404 });
    }

    // ── Step 4: Upsert vendor in Supabase (create or update by email) ─────────
    console.log(`[sync-vendor-pos] Upserting vendor in Supabase (email: ${finalUser.email})...`);
    const { data: vendor, error: vendorErr } = await supabase
      .from('vendors')
      .upsert(
        {
          email: finalUser.email,
          company_name: sfAccount.Name,
          sf_account_id: sfAccount.Id,
        },
        { onConflict: 'email', ignoreDuplicates: false }
      )
      .select('id, email, company_name, sf_account_id')
      .single();

    if (vendorErr || !vendor) {
      console.error('[sync-vendor-pos] Failed to upsert vendor:', vendorErr);
      return NextResponse.json({ error: 'Failed to sync vendor record' }, { status: 500 });
    }

    console.log('[sync-vendor-pos] Vendor upserted:', vendor);

    // ── Step 5: Fetch Approved POs from SF for this Account ──────────────────
    console.log(`[sync-vendor-pos] Querying POs for SF Account ID: ${sfAccount.Id}...`);
    const poResult = await conn.query<{
      Id: string;
      Name: string;
      Status__c: string;
      Vendor_Delivery_Status__c: string;
      Expected_Delivery_Date__c: string | null;
    }>(
      `SELECT Id, Name, Status__c, Vendor_Delivery_Status__c, Expected_Delivery_Date__c
       FROM Purchase_Order__c
       WHERE Vendor__c = '${sfAccount.Id}'
       AND Status__c = 'Approved'`
    );

    const sfPos = poResult.records ?? [];
    console.log(`[sync-vendor-pos] Found ${sfPos.length} approved PO(s) in Salesforce.`);

    // ── Step 6: Upsert POs into Supabase linked to the real vendor.id ─────────
    let synced = 0;
    for (const po of sfPos) {
      console.log(`[sync-vendor-pos] Upserting PO ${po.Name} (SF ID: ${po.Id})...`);
      const { error: upsertErr } = await supabase.from('purchase_orders').upsert(
        {
          sf_po_id: po.Id,
          po_number: po.Name,
          vendor_id: vendor.id,
          status: po.Status__c,
          delivery_status: po.Vendor_Delivery_Status__c ?? 'Pending',
          expected_delivery_date: po.Expected_Delivery_Date__c ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'sf_po_id', ignoreDuplicates: false }
      );
      if (upsertErr) {
        console.error(`[sync-vendor-pos] Error upserting PO ${po.Name}:`, upsertErr);
      } else {
        synced++;
      }
    }

    console.log(`[sync-vendor-pos] Sync complete. Synced ${synced}/${sfPos.length} POs.`);
    return NextResponse.json({ synced, total: sfPos.length, vendor });
  } catch (err) {
    console.error('[sync-vendor-pos]', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
