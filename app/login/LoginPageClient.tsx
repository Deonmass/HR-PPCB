'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { showError } from '@/lib/swal';

export default function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('123');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Identifiants invalides');
        return;
      }
      const next = searchParams.get('next') || '/';
      router.replace(next);
      router.refresh();
    } catch {
      await showError('Erreur réseau lors de la connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-glow login-bg-glow-a" aria-hidden />
      <div className="login-bg-glow login-bg-glow-b" aria-hidden />
      <div className="login-grid" aria-hidden />

      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-badge">PPC Barnet</span>
          <h1>RH Platform</h1>
          <p>Portail de gestion des ressources humaines</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Identifiant</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="login-hint">Identifiants par défaut : admin / 123</p>
      </div>
    </div>
  );
}
