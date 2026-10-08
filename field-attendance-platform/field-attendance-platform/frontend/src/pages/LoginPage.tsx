import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { errorMessage } from '../services/api';

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const u = await login(identifier.trim(), password);
      nav(u.role === 'ADMIN' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err) || 'Authentication failed. Please verify your credentials.');
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (id: string, pass: string) => {
    setIdentifier(id);
    setPassword(pass);
    setError('');
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('/ncode_bg.jpg')`, backgroundColor: '#0a192f' }}
    >
      {/* Dark gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 to-transparent md:w-2/3" />
      <div className="absolute inset-0 bg-slate-900/30" />

      {/* Main Container */}
      <div className="w-full max-w-6xl flex flex-col md:flex-row items-center justify-between z-10 gap-8">
        
        {/* Left Side: Branding */}
        <div className="text-center md:text-left flex-1 pl-0 md:pl-8 text-white relative">
          <div className="flex flex-col items-center md:items-start">
            {/* Ncode Solutions Logo Box */}
            <div className="bg-white p-3 px-4 rounded shadow-lg mb-8 inline-block">
              <span className="text-[#0088cc] font-bold text-2xl flex items-center gap-1 leading-none">
                 <span className="border-2 border-[#0088cc] rounded-full px-1.5 py-0.5 text-lg mr-1">(n)</span>
                 <div>Code<sup className="text-xs">&reg;</sup><div className="text-xs font-normal text-slate-400 mt-0.5 tracking-wide uppercase">Solutions</div></div>
              </span>
            </div>
            
            <h1 className="text-4xl md:text-5xl font-light mb-4 text-white">
              Field Force Platform
            </h1>
            <p className="text-lg text-slate-300 mb-8 max-w-md">
              Enterprise management for live attendance, tracking, and remote field operations.
            </p>
          </div>
        </div>

        {/* Right Side: Login Card */}
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl shadow-2xl p-8 sm:p-10">
            <div className="mb-8">
              <p className="text-sm font-semibold text-blue-600 mb-1">Welcome to</p>
              <p className="text-lg text-slate-600 mb-4">Ncode IT Division Portal</p>
              <h2 className="text-3xl font-bold text-slate-800">Login</h2>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Enter your username
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Enter Login ID"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Enter your Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-blue-600 hover:text-blue-800"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded bg-red-50 border border-red-200 p-2 text-xs text-red-600">
                  {error}
                </div>
              )}

              <div className="pt-2 flex flex-col gap-3">
                <button
                  type="submit"
                  className="w-full bg-[#0088ff] hover:bg-blue-600 text-white font-semibold py-2.5 rounded shadow-sm transition-colors"
                  disabled={busy}
                >
                  {busy ? 'Authenticating...' : 'Login'}
                </button>
                <button
                  type="button"
                  className="w-full bg-[#0088ff] hover:bg-blue-600 text-white font-semibold py-2.5 rounded shadow-sm transition-colors"
                  onClick={() => {
                     setIdentifier('');
                     setPassword('');
                  }}
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="mt-8 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 text-center mb-2">Test Credentials</p>
              <div className="flex justify-center gap-4 text-xs">
                <button
                  type="button"
                  onClick={() => fillDemo('NS00125', 'Password123!')}
                  className="text-blue-600 hover:underline"
                >
                  Field Officer
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo('admin', 'adminpassword123')}
                  className="text-blue-600 hover:underline"
                >
                  Admin
                </button>
              </div>
              <div className="mt-4 text-center text-xs text-slate-500">
                New employee? <Link className="text-blue-600 hover:underline" to="/register">Register</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
