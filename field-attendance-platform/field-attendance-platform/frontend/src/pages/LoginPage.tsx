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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col justify-center items-center px-4 py-12">
      {/* Container */}
      <div className="w-full max-w-md">
        {/* Company Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-500 to-blue-600 text-white shadow-xl shadow-blue-900/50 mb-4 ring-4 ring-white/10">
            <span className="text-2xl font-black tracking-wider">(n)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white uppercase">
            Ncode Solution IT Division
          </h1>
          <p className="text-sm font-medium text-teal-400 uppercase tracking-widest mt-0.5">
            (GNFC)
          </p>
          <p className="text-xs text-slate-400 mt-2 font-light">
            Field Attendance, Location Tracking & Activity Management
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="label text-slate-700 flex items-center justify-between">
                <span>User ID / Email / ESIC Number</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="input pr-10 text-slate-900 placeholder-slate-400"
                  placeholder="e.g. NS00125, employee@ncode.example, ESIC123456789"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoFocus
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Enter your Employee ID, company email, or registered ESIC number.
              </p>
            </div>

            <div>
              <label className="label text-slate-700 flex items-center justify-between">
                <span>Password</span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] font-normal text-blue-800 hover:underline capitalize"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10 text-slate-900 placeholder-slate-400"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="whitespace-pre-line leading-relaxed">{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full py-2.5 text-sm font-semibold tracking-wide shadow-md shadow-blue-900/20"
              disabled={busy}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  Authenticating...
                </span>
              ) : (
                'LOGIN TO PORTAL'
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Assistant */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Quick Test Credentials
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => fillDemo('NS00125', 'Password123!')}
                className="text-left p-2 rounded-lg bg-slate-50 border border-slate-200/80 hover:bg-blue-50 hover:border-blue-200 transition-colors"
              >
                <div className="font-semibold text-slate-800">Field Employee</div>
                <div className="text-[11px] text-slate-500 font-mono">NS00125</div>
              </button>
              <button
                type="button"
                onClick={() => fillDemo('admin', 'adminpassword123')}
                className="text-left p-2 rounded-lg bg-slate-50 border border-slate-200/80 hover:bg-blue-50 hover:border-blue-200 transition-colors"
              >
                <div className="font-semibold text-slate-800">Administrator</div>
                <div className="text-[11px] text-slate-500 font-mono">admin</div>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Also test with Email: <code className="text-slate-600 font-mono">rahul.sharma@ncode.example</code> or ESIC: <code className="text-slate-600 font-mono">ESIC123456789</code>
            </p>
          </div>

          <div className="mt-5 text-center text-xs text-slate-500">
            New employee?{' '}
            <Link className="font-semibold text-blue-900 hover:text-blue-700 underline" to="/register">
              Register Company Profile
            </Link>
          </div>
        </div>

        {/* Security / Confidentiality Notice */}
        <p className="text-center text-[11px] text-slate-500 mt-6 leading-relaxed">
          Authorized internal system for Ncode Solution IT Division (GNFC).
          <br />
          All location tracking and field sessions are monitored and logged.
        </p>
      </div>
    </div>
  );
}
