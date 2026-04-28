export interface Vendor {
  id: string;
  email: string;
  sf_account_id: string;
  company_name: string;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  sf_po_id: string;
  po_number: string;
  vendor_id: string;
  status: string; // internal SF status: Approved / Pending / Rejected
  delivery_status: string; // Vendor_Delivery_Status__c: Pending | Order Accepted | Order Rejected | Shipped | Delivered
  expected_delivery_date: string | null;
  invoice_url: string | null;
  vendor_rejected: boolean;
  created_at: string;
  updated_at: string;
  // Joined from Supabase relational query
  purchase_order_line_items?: PurchaseOrderLineItem[];
}

export interface PurchaseOrderLineItem {
  id: string;
  sf_line_item_id: string;
  purchase_order_id: string;
  sf_po_id: string;
  name: string | null;
  product_name: string | null;
  product_sf_id: string | null;
  quantity: number | null;
  quantity_ordered: number | null;
  quantity_received: number | null;
  uom: string | null;
  unit_price: number | null;
  created_at: string;
  updated_at: string;
}

/** @deprecated Use PurchaseOrderLineItem instead — kept for backwards compatibility */
export interface POLineItem {
  Id: string;
  Name: string;
  Product__r?: { Name: string };
  Quantity__c?: number;
  Unit_Price__c?: number;
  Total_Price__c?: number;
}

export type DeliveryStatus =
  | 'Pending'
  | 'Order Accepted'
  | 'Order Rejected'
  | 'Shipped'
  | 'Delivered';
