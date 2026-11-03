import { useState, type FormEvent } from 'react';
import { Play } from 'lucide-react';
import { api } from '../api';
import { useSession } from '../session';

export function Accesso() {
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setInvio(true);
    setErrore(null);
    try {
      await api.accesso(email, password);
      refresh();
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <span className="brand-logo" style={{ width: 40, height: 40, borderRadius: 10 }}><Play size={18} fill="#fff" color="#fff" /></span>
        <div className="stack-sm" style={{ gap: 8 }}>
          <h1 className="t-title">Accedi a FilmShare</h1>
          <p className="t-body c-secondary" style={{ margin: 0 }}>
            Spazio privato per scambiare film e file pesanti tra amici. L'account te lo crea l'amministratore.
          </p>
        </div>
        <label className="field"><span>Email</span>
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field"><span>Password</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {errore && <p className="error-text" role="alert" style={{ margin: 0 }}>{errore}</p>}
        <button className="btn btn-primary" style={{ height: 42 }} disabled={invio}>{invio ? 'Accesso…' : 'Accedi'}</button>
      </form>
    </div>
  );
}
