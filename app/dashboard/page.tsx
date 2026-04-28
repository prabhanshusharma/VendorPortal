'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import type { PurchaseOrder } from '@/lib/types';

function getBadgeClass(status: string, rejected?: boolean) {
  if (rejected) return 'badge badge-rejected';
  switch (status) {
    case 'Order Accepted': return 'badge badge-accepted';
    case 'Order Rejected': return 'badge badge-rejected';
    case 'Shipped':        return 'badge badge-shipped';
    case 'Delivered':      return 'badge badge-delivered';
    default:               return 'badge badge-pending';
  }
}

function getDot(status: string, rejected?: boolean) {
  if (rejected) return 'var(--danger)';
  const colors: Record<string, string> = {
    'Order Accepted': 'var(--info)',
    'Order Rejected': 'var(--danger)',
    'Shipped':        'var(--purple)',
    'Delivered':      'var(--success)',
    'Pending':        'var(--warning)',
  };
  return colors[status] ?? 'var(--warning)';
}

function getDisplayStatus(po: PurchaseOrder) {
  if (po.vendor_rejected) return 'Rejected';
  return po.delivery_status;
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
            {label}
          </p>
          <p style={{ fontSize: 32, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
        </div>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: `${color}18`,
          border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [session, setSession] = useState<{ access_token: string } | null>(null);

  const loadPOs = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);

      const res = await fetch('/api/pos');
      if (res.ok) {
        const { pos: data } = await res.json();
        setPos(data ?? []);
      } else {
        console.error('Error fetching POs from API:', await res.text());
        setPos([]);
      }
    } catch (err) {
      console.error('Failed to load POs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPOs(); }, [loadPOs]);

  async function handleSync() {
    if (!session) return;
    setSyncing(true);
    await fetch('/api/sync-vendor-pos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await loadPOs();
    setSyncing(false);
  }

  const stats = {
    total:    pos.length,
    pending:  pos.filter(p => p.delivery_status === 'Pending' && !p.vendor_rejected).length,
    accepted: pos.filter(p => p.delivery_status === 'Order Accepted').length,
    shipped:  pos.filter(p => p.delivery_status === 'Shipped').length,
    delivered:pos.filter(p => p.delivery_status === 'Delivered').length,
    rejected: pos.filter(p => p.vendor_rejected || p.delivery_status === 'Order Rejected').length,
  };

  return (
    <div style={{ padding: '32px 32px 48px', minHeight: '100vh' }} className="animate-fade-in">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Dashboard
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            Purchase Orders Overview
          </p>
        </div>
        <button
          id="sync-btn"
          onClick={handleSync}
          disabled={syncing}
          className="btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <svg className={syncing ? 'animate-spin' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncing ? 'Syncing…' : 'Sync from Salesforce'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total POs" value={stats.total} color="var(--text-primary)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
        <StatCard label="Pending" value={stats.pending} color="var(--warning)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Accepted" value={stats.accepted} color="var(--accent)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Shipped" value={stats.shipped} color="var(--purple)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>} />
        <StatCard label="Delivered" value={stats.delivered} color="var(--success)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>} />
        <StatCard label="Rejected" value={stats.rejected} color="var(--danger)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-6 6M9 9l6 6" /></svg>} />
      </div>

      {/* PO Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Purchase Orders
          </h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pos.length} record{pos.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 12px', display: 'block' }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Loading purchase orders…
          </div>
        ) : pos.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: 15 }}>No purchase orders found.</p>
            <p style={{ fontSize: 13, marginTop: 8 }}>Click &ldquo;Sync from Salesforce&rdquo; to fetch your latest POs.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>SF Status</th>
                  <th>Delivery Status</th>
                  <th>Products</th>
                  <th>Expected Delivery</th>
                  <th>Invoice</th>
                  <th>Last Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => {
                  const lineItems = po.purchase_order_line_items ?? [];
                  const productCount = lineItems.length;
                  const productNames = lineItems
                    .map(li => li.product_name)
                    .filter(Boolean)
                    .slice(0, 2);
                  const displayStatus = getDisplayStatus(po);

                  return (
                    <tr key={po.id} onClick={() => router.push(`/dashboard/${po.id}`)}>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{po.po_number}</span>
                      </td>
                      <td>
                        <span className="badge badge-approved">{po.status}</span>
                      </td>
                      <td>
                        <span className={getBadgeClass(po.delivery_status, po.vendor_rejected)}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: getDot(po.delivery_status, po.vendor_rejected), display: 'inline-block' }} />
                          {displayStatus}
                        </span>
                      </td>
                      <td>
                        {productCount > 0 ? (
                          <div>
                            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                              {productNames.join(', ')}
                              {productCount > 2 && (
                                <span style={{ color: 'var(--text-muted)' }}> +{productCount - 2} more</span>
                              )}
                            </span>
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              {productCount} item{productCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>
                        )}
                      </td>
                      <td style={{ color: po.expected_delivery_date ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {po.expected_delivery_date
                          ? new Date(po.expected_delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                      <td>
                        {po.invoice_url
                          ? <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 500 }}>✓ Uploaded</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(po.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                      <td>
                        <button
                          style={{
                            padding: '5px 12px', borderRadius: 7,
                            background: 'var(--accent-glow)', border: '1px solid var(--info-border)',
                            color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                          onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/${po.id}`); }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
