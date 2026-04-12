/**
 * src/app/report/view/[shareToken]/page.js
 * Server Component — generates OG meta tags for WhatsApp previews,
 * then renders ReportViewClient with the shareToken prop.
 */

import ReportViewClient from './ReportViewClient';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mediconnect-healthcare-system.vercel.app';
const API_URL = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:5000/api';

export const dynamic = 'force-dynamic';
export function generateStaticParams() { return []; }

export async function generateMetadata(props) {
  // Works on Next.js 13, 14 and 15 — params may be a Promise in Next.js 15
  const params     = await Promise.resolve(props.params);
  const shareToken = params?.shareToken ?? '';

  let title       = 'Medical Report Shared With You';
  let description = 'A medical report has been shared with you via NexMedicon AI. Log in to view it securely.';

  if (shareToken) {
    try {
      const r = await fetch(`${API_URL}/reports/shared/${shareToken}/meta`, { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d.reportType) {
          title       = `${d.reportType} — Shared with you`;
          description = `${d.patientName ? d.patientName + ' has' : 'Someone has'} shared a ${d.reportType} with you via NexMedicon AI.`;
        }
      }
    } catch {}
  }

  const pageUrl = `${APP_URL}/report/view/${shareToken}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url:      pageUrl,
      siteName: 'NexMedicon AI',
      type:     'website',
      images:   [{ url: `${APP_URL}/og-report.png`, width: 1200, height: 630, alt: 'NexMedicon AI' }],
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
      images:      [`${APP_URL}/og-report.png`],
    },
    alternates: { canonical: pageUrl },
  };
}

export default async function ReportViewPage(props) {
  // Works on Next.js 13, 14 and 15
  const params     = await Promise.resolve(props.params);
  const shareToken = params?.shareToken ?? '';
  return <ReportViewClient shareToken={shareToken} />;
}