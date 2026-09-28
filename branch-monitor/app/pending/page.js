import { logoutAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PendingPage() {
  const { user, profile } = await getCurrentUser();
  if (!user) redirect("/login");
  if (profile?.approved) redirect("/dashboard");
  return (
    <main className="auth-page">
      <section className="auth-panel center auth-panel-pending">
        <div className="pending-brand-mark"><img src="/stelco-icon.png" alt="STELCO" /></div>
        <div className="eyebrow">SRD Access</div>
        <h1>Approval pending</h1>
        <p>Your account is registered. The HOD must approve your account and assign your unit before operational information becomes available.</p>
        <form action={logoutAction}><button className="btn secondary">Sign out</button></form>
      </section>
    </main>
  );
}
