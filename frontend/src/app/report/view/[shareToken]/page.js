/**
 * src/app/report/view/[shareToken]/page.js
 *
 * Server Component — handles Open Graph meta tags for WhatsApp previews.
 * 
 * FIX: In Next.js 15, `params` is a Promise and must be awaited.
 * Previously `params.shareToken` returned undefined → "Invalid share link" error.
 */

import ReportViewClient from './ReportViewClient';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mediconnect-healthcare-system.vercel.app';
const API     = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:5000/api';

export function generateStaticParams() { return []; }
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  // Await params — required in Next.js 15+
  const { shareToken } = await Promise.resolve(params);

  let title       = 'Medical Report Shared With You';
  let description = 'A medical report has been shared with you via NexMedicon AI. Log in to view it securely.';

  try {
    const r = await fetch(`${API}/reports/shared/${shareToken}/meta`, {
      next: { revalidate: 0 },
    });
    if (r.ok) {
      const d = await r.json();
      if (d.reportType) {
        title       = `${d.reportType} — Shared with you`;
        description = `${d.patientName ? d.patientName + ' has' : 'Someone has'} shared a ${d.reportType} with you via NexMedicon AI.`;
      }
    }
  } catch {}

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
      images: [{ url: `${APP_URL}/og-report.png`, width: 1200, height: 630, alt: 'NexMedicon AI — Medical Report' }],
    },
    twitter: {
      card: 'summary_large_image', title, description,
      images: [`${APP_URL}/og-report.png`],
    },
    alternates: { canonical: pageUrl },
  };
}

export default async function ReportViewPage({ params }) {
  // Await params — required in Next.js 15+
  const { shareToken } = await Promise.resolve(params);
  return <ReportViewClient shareToken={shareToken} />;
}