'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import type { PurchaseOrder, POLineItem } from '@/lib/types';

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
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [expectedDate, setExpectedDate] = useState('');
  const [newDeliveryStatus, setNewDeliveryStatus] = useState('');
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
      if (!res.ok) {
        router.push('/dashboard');
        return;
      }
      
      const { po: data } = await res.json();
      setPo(data);
      setExpectedDate(data.expected_delivery_date ?? '');
      setNewDeliveryStatus(data.delivery_status);

      // Fetch line items from SF
      if (data.sf_po_id) {
        const lineItemsRes = await fetch(`/api/fetch-line-items?sfPoId=${data.sf_po_id}`);
        if (lineItemsRes.ok) {
          const { lineItems: items } = await lineItemsRes.json();
          setLineItems(items ?? []);
        }
      }
    } catch (err) {
      console.error('Failed to load PO:', err);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { loadPO(); }, [loadPO]);

  async function callUpdatePO(deliveryStatus: string, expDate?: string) {
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = { poId: id, deliveryStatus };
      if (expDate !== undefined) body.expectedDeliveryDate = expDate;

      const res = await fetch('/api/update-po', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
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
    await callUpdatePO('Order Rejected');
  }

  async function handleStatusUpdate() {
    if (!newDeliveryStatus || newDeliveryStatus === po?.delivery_status) return;
    await callUpdatePO(newDeliveryStatus, expectedDate || undefined);
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

  const isPending  = po.delivery_status === 'Pending';
  const isAccepted = po.delivery_status === 'Order Accepted';
  const isRejected = po.delivery_status === 'Order Rejected';
  const isShipped  = po.delivery_status === 'Shipped';
  const canUpdateStatus = isAccepted || isShipped;

  const allowedNextStatuses: string[] = isAccepted
    ? ['Order Accepted', 'Shipped']
    : isShipped
    ? ['Shipped', 'Delivered']
    : [];

  return (
    <div style={{ padding: '32px 32px 64px', maxWidth: 900, margin: '0 auto' }} className="animate-fade-in">

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 100,
          padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: toast.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
          border: `1px solid ${toast.type === 'success' ? 'var(--success-border)' : 'var(--danger-border)'}`,
          color: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.3s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Back */}
      <button
        onClick={() => router.push('/dashboard')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: 'var(--text-muted)', background: 'none', border: 'none',
          cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', marginBottom: 24,
          transition: 'color 0.15s',
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
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                {po.po_number}
              </h1>
              <span className={getBadgeClass(po.delivery_status)}>{po.delivery_status}</span>
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
      {!isRejected && (
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
                  <input
                    id="expected-date"
                    type="date"
                    className="input"
                    value={expectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                  />
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

          {canUpdateStatus && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Update the delivery progress for this order. Changes sync to Salesforce immediately.
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 220px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Delivery Status
                  </label>
                  <select
                    id="delivery-status-select"
                    className="input"
                    value={newDeliveryStatus}
                    onChange={(e) => setNewDeliveryStatus(e.target.value)}
                    style={{ colorScheme: 'dark', cursor: 'pointer' }}
                  >
                    {allowedNextStatuses.map((s) => (
                      <option key={s} value={s} style={{ background: 'var(--bg-secondary)' }}>{s}</option>
                    ))}
                  </select>
                </div>
                {isAccepted && (
                  <div style={{ flex: '0 0 200px' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Expected Delivery Date
                    </label>
                    <input
                      type="date"
                      className="input"
                      value={expectedDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                )}
                <button
                  id="update-status-btn"
                  onClick={handleStatusUpdate}
                  disabled={actionLoading || newDeliveryStatus === po.delivery_status}
                  className="btn-primary"
                >
                  {actionLoading ? '…' : 'Update Status'}
                </button>
              </div>
            </div>
          )}

          {po.delivery_status === 'Delivered' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 18px', borderRadius: 10,
              background: 'var(--success-bg)', border: '1px solid var(--success-border)',
              color: 'var(--success)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600 }}>This order has been delivered successfully.</span>
            </div>
          )}
        </div>
      )}

      {isRejected && (
        <div className="card" style={{ padding: '20px 28px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-6 6M9 9l6 6" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600 }}>You have rejected this purchase order.</span>
          </div>
        </div>
      )}

      {/* Invoice Upload */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Invoice
        </h2>

        {po.invoice_url && (
          <div style={{ marginBottom: 16 }}>
            <a
              href={po.invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: 'var(--success)', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Uploaded Invoice
            </a>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label
            htmlFor="invoice-file"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 16px', borderRadius: 9,
              border: '1px dashed var(--border-light)',
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {po.invoice_url ? 'Replace Invoice' : 'Choose Invoice File'}
            <input id="invoice-file" type="file" accept=".pdf,.png,.jpg,.jpeg" ref={fileRef} style={{ display: 'none' }} />
          </label>
          <button
            id="upload-invoice-btn"
            onClick={handleInvoiceUpload}
            disabled={uploadLoading}
            className="btn-ghost"
          >
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
      </div>

      {/* Line Items */}
      {lineItems.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Line Items
            </h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Item #</th>
                <th>Product</th>
                <th style={{ textAlign: 'right' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => (
                <tr key={item.Id} style={{ cursor: 'default' }}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{idx + 1}</td>
                  <td style={{ fontWeight: 500 }}>{item.Product__r?.Name ?? item.Name ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.Quantity__c?.toLocaleString('en-IN') ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {item.Unit_Price__c != null ? `₹${item.Unit_Price__c.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                    {item.Total_Price__c != null ? `₹${item.Total_Price__c.toLocaleString('en-IN')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
