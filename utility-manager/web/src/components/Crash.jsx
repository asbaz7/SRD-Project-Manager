import { Component } from 'react';

// A page that throws while drawing would otherwise leave the whole app
// blank. Usually it's a tab left open across a deploy (new code meeting old
// data, or the other way round), so the first time it reloads the page by
// itself; if it happens again within a minute it says so, with the error to
// pass on. `resetKey` (the address) clears it when you go to another page.
export class CrashGuard extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
    const last = Number(sessionStorage.getItem('crash-reload') || 0);
    if (Date.now() - last > 60_000) {
      sessionStorage.setItem('crash-reload', String(Date.now()));
      window.location.reload();
    }
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <div className="card crash">
      <h2>This page couldn't be shown</h2>
      <p className="muted">Reloading usually fixes it. If it keeps happening, send a screenshot of this message.</p>
      <p className="small"><code>{String(error?.message || error).slice(0, 300)}</code></p>
      <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
    </div>;
  }
}
