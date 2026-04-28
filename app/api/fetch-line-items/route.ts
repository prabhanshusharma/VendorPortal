import { NextRequest, NextResponse } from 'next/server';
import { getSFConnection } from '@/lib/salesforce';

export async function GET(req: NextRequest) {
  try {
    const sfPoId = req.nextUrl.searchParams.get('sfPoId');
    if (!sfPoId) return NextResponse.json({ error: 'Missing sfPoId' }, { status: 400 });

    const conn = await getSFConnection();

    const result = await conn.query<{
      Id: string;
      Name: string;
      Product__r: { Name: string } | null;
      Quantity__c: number | null;
      Unit_Price__c: number | null;
      Total_Price__c: number | null;
    }>(
      `SELECT Id, Name, Product__r.Name, Quantity__c, Unit_Price__c, Total_Price__c
       FROM PO_Line_Item__c
       WHERE Purchase_Order__c = '${sfPoId}'`
    );

    return NextResponse.json({ lineItems: result.records ?? [] });
  } catch (err) {
    console.error('[fetch-line-items]', err);
    // Return empty gracefully so PO detail still loads
    return NextResponse.json({ lineItems: [] });
  }
}
