import Link from "next/link";
import { loginAction } from "@/app/actions";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel-login">
        <div className="auth-brand">
          <img src="/stelco-logo.png" alt="STELCO — State Electric Company Limited" className="auth-brand-logo" />
          <div className="auth-brand-rule" />
          <div>
            <div className="eyebrow">South Regional Department</div>
            <h1>Branch Monitor</h1>
            <p className="auth-subtitle">Projects, works and branch operations across K, ADh, V and M atolls.</p>
          </div>
        </div>

        {params?.error && <div className="alert danger">{params.error}</div>}

        <form action={loginAction} className="form-stack auth-form">
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn primary auth-submit" type="submit">Sign in</button>
        </form>

        <div className="auth-footer">New staff member? <Link href="/register">Request access</Link></div>
      </section>
    </main>
  );
}
