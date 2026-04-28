'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import type { PurchaseOrder, PurchaseOrderLineItem } from '@/lib/types';

function getBadgeClass(status: string) {
  switch (status) {
    case 'Order Accepted': return 'badge badge-accepted';
    case 'Order Rejected': return 'badge badge-rejected';
    case 'Shipped':        return 'badge badge-shipped';
    case 'Delivered':      return 'badge badge-delivered';
    default:               return 'badge badge-pending';
  }
}

export default function PODetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [lineItems, setLineItems] = useState<PurchaseOrderLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [expectedDate, setExpectedDate] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadPO = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      setAccessToken(session.access_token);

      const res = await fetch(`/api/pos/${id}`);
      if (!res.ok) { router.push('/dashboard'); return; }

      const { po: data } = await res.json();
      setPo(data);
      setExpectedDate(data.expected_delivery_date ?? '');
      setLineItems(data.purchase_order_line_items ?? []);
    } catch (err) {
      console.error('Failed to load PO:', err);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { loadPO(); }, [loadPO]);

  async function callUpdatePO(deliveryStatus: string, expDate?: string, vendorRejected?: boolean) {
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = { poId: id, deliveryStatus };
      if (expDate !== undefined) body.expectedDeliveryDate = expDate;
      if (vendorRejected !== undefined) body.vendorRejected = vendorRejected;

      const res = await fetch('/api/update-po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Update failed');
      showToast('Updated successfully and synced to Salesforce ✓');
      await loadPO();
    } catch {
      showToast('Update failed. Please try again.', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAccept() {
    if (!expectedDate) {
      showToast('Please set an expected delivery date before accepting.', 'error');
      return;
    }
    await callUpdatePO('Order Accepted', expectedDate);
  }

  async function handleReject() {
    await callUpdatePO('Order Rejected', undefined, true);
  }

  async function handleShip() {
    await callUpdatePO('Shipped', expectedDate || undefined);
  }

  async function handleInvoiceUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { showToast('Please select a file.', 'error'); return; }
    setUploadLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('poId', id);
      const res = await fetch('/api/upload-invoice', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      showToast('Invoice uploaded and attached to Salesforce PO ✓');
      if (fileRef.current) fileRef.current.value = '';
      await loadPO();
    } catch {
      showToast('Upload failed. Please try again.', 'error');
    } finally {
      setUploadLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
        <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        Loading purchase order…
      </div>
    );
  }

  if (!po) return null;

  const isPending  = po.delivery_status === 'Pending' && !po.vendor_rejected;
  const isAccepted = po.delivery_status === 'Order Accepted';
  const isRejected = po.vendor_rejected || po.delivery_status === 'Order Rejected';
  const isShipped  = po.delivery_status === 'Shipped';
  const isDelivered = po.delivery_status === 'Delivered';

  return (
    <div style={{ padding: '32px 32px 64px', maxWidth: 960, margin: '0 auto' }} className="animate-fade-in">

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 100,
          padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: toast.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
          border: `1px solid ${toast.type === 'success' ? 'var(--success-border)' : 'var(--danger-border)'}`,
          color: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Back */}
      <button onClick={() => router.push('/dashboard')} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: 'var(--text-muted)', background: 'none', border: 'none',
        cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', marginBottom: 24, transition: 'color 0.15s',
      }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </button>

      {/* Header card */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{po.po_number}</h1>
              <span className={getBadgeClass(isRejected ? 'Order Rejected' : po.delivery_status)}>
                {isRejected ? 'Rejected' : po.delivery_status}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Salesforce ID: <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{po.sf_po_id}</span>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>SF Status</p>
            <span className="badge badge-approved">{po.status}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          {[
            { label: 'PO Created', value: new Date(po.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
            { label: 'Expected Delivery', value: po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
            { label: 'Last Updated', value: new Date(po.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Vendor Action Panel */}
      {!isRejected && !isDelivered && (
        <div className="card" style={{ padding: '24px 28px', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Vendor Actions
          </h2>

          {isPending && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                This purchase order is awaiting your response. Set an expected delivery date and then accept or reject.
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 220px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Expected Delivery Date *
                  </label>
                  <input id="expected-date" type="date" className="input" value={expectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    style={{ colorScheme: 'dark' }} />
                </div>
                <button id="accept-btn" onClick={handleAccept} disabled={actionLoading} className="btn-success">
                  {actionLoading ? '…' : '✓ Accept Order'}
                </button>
                <button id="reject-btn" onClick={handleReject} disabled={actionLoading} className="btn-danger">
                  {actionLoading ? '…' : '✕ Reject Order'}
                </button>
              </div>
            </div>
          )}

          {isAccepted && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Order accepted. You can now mark it as shipped when ready.
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 200px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Expected Delivery Date
                  </label>
                  <input type="date" className="input" value={expectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    style={{ colorScheme: 'dark' }} />
                </div>
                <button id="ship-btn" onClick={handleShip} disabled={actionLoading} className="btn-primary" style={{ gap: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                  {actionLoading ? '…' : 'Mark as Shipped'}
                </button>
              </div>
            </div>
          )}

          {isShipped && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 18px', borderRadius: 10,
              background: 'var(--purple-bg)', border: '1px solid var(--purple-border)', color: 'var(--purple)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Order shipped — awaiting delivery confirmation from buyer.</span>
            </div>
          )}
        </div>
      )}

      {isDelivered && (
        <div className="card" style={{ padding: '20px 28px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 10, background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600 }}>This order has been delivered successfully.</span>
          </div>
        </div>
      )}

      {isRejected && (
        <div className="card" style={{ padding: '20px 28px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-6 6M9 9l6 6" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600 }}>This purchase order has been rejected.</span>
          </div>
        </div>
      )}

      {/* Invoice Upload */}
      {(!isRejected || po.invoice_url) && (
        <div className="card" style={{ padding: '24px 28px', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Invoice
          </h2>
          {po.invoice_url && (
            <div style={{ marginBottom: 16 }}>
              <a href={po.invoice_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View Uploaded Invoice
              </a>
            </div>
          )}
          {!isRejected && !po.invoice_url && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label htmlFor="invoice-file" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 16px', borderRadius: 9, border: '1px dashed var(--border-light)',
                  color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
                }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Choose Invoice File
                  <input id="invoice-file" type="file" accept=".pdf,.png,.jpg,.jpeg" ref={fileRef} style={{ display: 'none' }} />
                </label>
                <button id="upload-invoice-btn" onClick={handleInvoiceUpload} disabled={uploadLoading} className="btn-ghost">
                  {uploadLoading ? (
                    <>
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                      </svg>
                      Uploading…
                    </>
                  ) : 'Upload Invoice'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 0' }}>
                PDF, PNG or JPG. Invoice will be attached to the SF Purchase Order record.
              </p>
            </>
          )}
        </div>
      )}

      {/* Line Items */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Order Items</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lineItems.length} item{lineItems.length !== 1 ? 's' : ''}</span>
        </div>
        {lineItems.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Item Name</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Qty Ordered</th>
                <th style={{ textAlign: 'right' }}>Qty Received</th>
                <th>UOM</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => (
                <tr key={item.id} style={{ cursor: 'default' }}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{idx + 1}</td>
                  <td style={{ fontWeight: 500 }}>{item.product_name ?? '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{item.name ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.quantity?.toLocaleString('en-IN') ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.quantity_ordered?.toLocaleString('en-IN') ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.quantity_received?.toLocaleString('en-IN') ?? '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{item.uom ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                    {item.unit_price != null ? `₹${item.unit_price.toLocaleString('en-IN')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No line items found for this purchase order.
          </div>
        )}
      </div>
    </div>
  );
}
