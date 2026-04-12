/**
 * src/app/report/view/[shareToken]/page.js
 * Server Component — passes shareToken to ReportViewClient.
 */

import ReportViewClient from './ReportViewClient';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mediconnect-healthcare-system.vercel.app';
const API     = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:5000/api';

export function generateStaticParams() { return []; }
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const shareToken     = resolvedParams?.shareToken || '';

  let title       = 'Medical Report Shared With You';
  let description = 'A medical report has been shared with you via NexMedicon AI. Log in to view it securely.';

  if (shareToken) {
    try {
      const r = await fetch(`${API}/reports/shared/${shareToken}/meta`, { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d.reportType) {
          title       = `${d.reportType} — Shared with you`;
          description = `${d.patientName ? d.patientName + ' has' : 'Someone has'} shared a ${d.reportType} with you via NexMedicon AI.`;
        }
      }
    } catch {}
  }

  const pageUrl = shareToken ? `${APP_URL}/report/view/${shareToken}` : APP_URL;

  return {
    title,
    description,
    openGraph: {
      title, description, url: pageUrl, siteName: 'NexMedicon AI', type: 'website',
      images: [{ url: `${APP_URL}/og-report.png`, width: 1200, height: 630, alt: 'NexMedicon AI' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [`${APP_URL}/og-report.png`] },
    alternates: { canonical: pageUrl },
  };
}

export default async function ReportViewPage({ params }) {
  const resolvedParams = await params;
  const shareToken     = resolvedParams?.shareToken || '';
  return <ReportViewClient shareToken={shareToken} />;
}