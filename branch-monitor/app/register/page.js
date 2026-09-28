import Link from "next/link";
import { registerAction } from "@/app/actions";

export default async function RegisterPage({ searchParams }) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel-login">
        <div className="auth-brand">
          <img src="/stelco-logo.png" alt="STELCO — State Electric Company Limited" className="auth-brand-logo" />
          <div className="auth-brand-rule" />
          <div>
            <div className="eyebrow">South Regional Department</div>
            <h1>Request system access</h1>
            <p className="auth-subtitle">Register with your company email. Access remains restricted until approved by the HOD.</p>
          </div>
        </div>

        {params?.error && <div className="alert danger">{params.error}</div>}

        <form action={registerAction} className="form-stack auth-form">
          <label>Full name<input name="full_name" autoComplete="name" required /></label>
          <label>Company email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <button className="btn primary auth-submit" type="submit">Request access</button>
        </form>

        <div className="auth-footer"><Link href="/login">Back to sign in</Link></div>
      </section>
    </main>
  );
}
