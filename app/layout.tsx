import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vendor Portal – RajTech Industries',
  description: 'Vendor Portal for RajTech Industries Pvt. Ltd. – manage purchase orders, delivery status and invoices.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
