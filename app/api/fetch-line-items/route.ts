import { NextRequest, NextResponse } from 'next/server';
import { getSFConnection } from '@/lib/salesforce';

/**
 * Fetches line items directly from Salesforce.
 * Note: Line items are now also synced to Supabase via the sync-vendor-pos route.
 * This endpoint is kept as a fallback / for live data refresh.
 */
export async function GET(req: NextRequest) {
  try {
    const sfPoId = req.nextUrl.searchParams.get('sfPoId');
    if (!sfPoId) return NextResponse.json({ error: 'Missing sfPoId' }, { status: 400 });

    const conn = await getSFConnection();

    const result = await conn.query<{
      Id: string;
      Name: string;
      Product__c: string | null;
      Product__r: { Name: string } | null;
      Quantity__c: number | null;
      Quantity_Ordered__c: number | null;
      Quantity_Received__c: number | null;
      UOM__c: string | null;
      Unit_Price__c: number | null;
    }>(
      `SELECT Id, Name, Product__c, Product__r.Name,
              Quantity_Ordered__c, Quantity_Received__c, Quantity__c, UOM__c, Unit_Price__c
       FROM Purchase_Order_Line__c
       WHERE Purchase_Order__c = '${sfPoId}'`
    );

    return NextResponse.json({ lineItems: result.records ?? [] });
  } catch (err) {
    console.error('[fetch-line-items]', err);
    // Return empty gracefully so PO detail still loads
    return NextResponse.json({ lineItems: [] });
  }
}
