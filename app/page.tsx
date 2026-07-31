import { redirect } from 'next/navigation';

// Root redirects to /documents (protected — proxy.ts will send unauthenticated
// users to /login before they ever reach this page).
export default function RootPage() {
  redirect('/documents');
}
