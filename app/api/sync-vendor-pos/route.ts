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
      Vendor_Rejected__c: boolean;
    }>(
      `SELECT Id, Name, Status__c, Vendor_Delivery_Status__c, Expected_Delivery_Date__c, Vendor_Rejected__c
       FROM Purchase_Order__c
       WHERE Vendor__c = '${sfAccount.Id}'
       AND Status__c = 'Approved'`
    );

    const sfPos = poResult.records ?? [];
    console.log(`[sync-vendor-pos] Found ${sfPos.length} approved PO(s) in Salesforce.`);

    // Collect SF PO IDs for stale-record cleanup
    const sfPoIds = sfPos.map(po => po.Id);

    // ── Step 6: Delete stale POs from Supabase ───────────────────────────────
    // Remove any POs in Supabase for this vendor that are no longer in SF
    if (sfPoIds.length > 0) {
      const { data: deletedPos, error: deleteErr } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('vendor_id', vendor.id)
        .not('sf_po_id', 'in', `(${sfPoIds.join(',')})`)
        .select('id, sf_po_id');

      if (deleteErr) {
        console.error('[sync-vendor-pos] Error deleting stale POs:', deleteErr);
      } else {
        console.log(`[sync-vendor-pos] Deleted ${deletedPos?.length ?? 0} stale PO(s) from Supabase.`);
      }
    } else {
      // No POs in SF — delete ALL POs for this vendor in Supabase
      const { data: deletedAll, error: deleteAllErr } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('vendor_id', vendor.id)
        .select('id, sf_po_id');

      if (deleteAllErr) {
        console.error('[sync-vendor-pos] Error deleting all POs:', deleteAllErr);
      } else {
        console.log(`[sync-vendor-pos] Deleted ${deletedAll?.length ?? 0} PO(s) — no POs found in SF.`);
      }
    }

    // ── Step 7: Upsert POs into Supabase linked to the real vendor.id ─────────
    let synced = 0;
    const upsertedPoMap: Record<string, string> = {}; // sf_po_id -> supabase po id

    for (const po of sfPos) {
      console.log(`[sync-vendor-pos] Upserting PO ${po.Name} (SF ID: ${po.Id})...`);
      const { data: upsertedPo, error: upsertErr } = await supabase.from('purchase_orders').upsert(
        {
          sf_po_id: po.Id,
          po_number: po.Name,
          vendor_id: vendor.id,
          status: po.Status__c,
          delivery_status: po.Vendor_Delivery_Status__c ?? 'Pending',
          expected_delivery_date: po.Expected_Delivery_Date__c ?? null,
          vendor_rejected: po.Vendor_Rejected__c ?? false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'sf_po_id', ignoreDuplicates: false }
      ).select('id, sf_po_id').single();

      if (upsertErr) {
        console.error(`[sync-vendor-pos] Error upserting PO ${po.Name}:`, upsertErr);
      } else {
        synced++;
        if (upsertedPo) {
          upsertedPoMap[upsertedPo.sf_po_id] = upsertedPo.id;
        }
      }
    }

    console.log(`[sync-vendor-pos] Sync complete. Synced ${synced}/${sfPos.length} POs.`);

    // ── Step 8: Sync Purchase Order Line Items ────────────────────────────────
    let lineItemsSynced = 0;

    if (sfPoIds.length > 0) {
      console.log(`[sync-vendor-pos] Fetching line items for ${sfPoIds.length} PO(s)...`);

      // Salesforce IN clause needs quoted IDs
      const quotedIds = sfPoIds.map(id => `'${id}'`).join(',');

      const lineItemResult = await conn.query<{
        Id: string;
        Name: string;
        Purchase_Order__c: string;
        Product__c: string | null;
        Product__r: { Name: string } | null;
        Quantity_Ordered__c: number | null;
        Quantity_Received__c: number | null;
        Quantity__c: number | null;
        UOM__c: string | null;
        Unit_Price__c: number | null;
      }>(
        `SELECT Id, Name, Purchase_Order__c, Product__c, Product__r.Name,
                Quantity_Ordered__c, Quantity_Received__c, Quantity__c, UOM__c, Unit_Price__c
         FROM Purchase_Order_Line__c
         WHERE Purchase_Order__c IN (${quotedIds})`
      );

      const sfLineItems = lineItemResult.records ?? [];
      console.log(`[sync-vendor-pos] Found ${sfLineItems.length} line item(s) in Salesforce.`);

      // Collect SF line item IDs for stale cleanup
      const sfLineItemIds = sfLineItems.map(li => li.Id);

      // Delete stale line items for these POs
      if (sfLineItemIds.length > 0) {
        const { data: deletedLis, error: deleteLiErr } = await supabase
          .from('purchase_order_line_items')
          .delete()
          .in('sf_po_id', sfPoIds)
          .not('sf_line_item_id', 'in', `(${sfLineItemIds.join(',')})`)
          .select('id');

        if (deleteLiErr) {
          console.error('[sync-vendor-pos] Error deleting stale line items:', deleteLiErr);
        } else {
          console.log(`[sync-vendor-pos] Deleted ${deletedLis?.length ?? 0} stale line item(s).`);
        }
      } else {
        // No line items in SF for these POs — delete all local ones
        const { error: deleteAllLiErr } = await supabase
          .from('purchase_order_line_items')
          .delete()
          .in('sf_po_id', sfPoIds);

        if (deleteAllLiErr) {
          console.error('[sync-vendor-pos] Error deleting all line items:', deleteAllLiErr);
        }
      }

      // Upsert line items
      for (const li of sfLineItems) {
        const supabasePoId = upsertedPoMap[li.Purchase_Order__c];
        if (!supabasePoId) {
          console.warn(`[sync-vendor-pos] Skipping line item ${li.Id} — parent PO not found in map.`);
          continue;
        }

        const { error: liUpsertErr } = await supabase.from('purchase_order_line_items').upsert(
          {
            sf_line_item_id: li.Id,
            purchase_order_id: supabasePoId,
            sf_po_id: li.Purchase_Order__c,
            name: li.Name,
            product_name: li.Product__r?.Name ?? null,
            product_sf_id: li.Product__c ?? null,
            quantity: li.Quantity__c ?? null,
            quantity_ordered: li.Quantity_Ordered__c ?? null,
            quantity_received: li.Quantity_Received__c ?? null,
            uom: li.UOM__c ?? null,
            unit_price: li.Unit_Price__c ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'sf_line_item_id', ignoreDuplicates: false }
        );

        if (liUpsertErr) {
          console.error(`[sync-vendor-pos] Error upserting line item ${li.Id}:`, liUpsertErr);
        } else {
          lineItemsSynced++;
        }
      }

      console.log(`[sync-vendor-pos] Synced ${lineItemsSynced}/${sfLineItems.length} line item(s).`);
    }

    return NextResponse.json({
      synced,
      lineItemsSynced,
      total: sfPos.length,
      vendor,
    });
  } catch (err) {
    console.error('[sync-vendor-pos]', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
