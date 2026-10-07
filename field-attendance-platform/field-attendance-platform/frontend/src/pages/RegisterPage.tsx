import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../services/api';

export default function RegisterPage() {
  const nav = useNavigate();
  const [f, setF] = useState({
    username: '',
    employee_id: '',
    email: '',
    first_name: '',
    last_name: '',
    esic_number: '',
    department: 'IT Division (GNFC)',
    designation: 'Field Officer',
    phone: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    if (k === 'employee_id') {
      setF({ ...f, employee_id: val, username: val });
    } else {
      setF({ ...f, [k]: val });
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/register/', {
        ...f,
        username: f.username || f.employee_id,
      });
      nav('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500 to-blue-600 text-white shadow-xl mb-3">
            <span className="text-xl font-black">(n)</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white uppercase">
            Ncode Solution IT Division
          </h1>
          <p className="text-xs font-semibold text-teal-400 uppercase tracking-widest">
            (GNFC) · Employee Enrollment
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-8">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">User / Employee ID *</label>
                <input
                  className="input"
                  placeholder="e.g. NS00128"
                  value={f.employee_id}
                  onChange={set('employee_id')}
                  required
                />
              </div>
              <div>
                <label className="label">ESIC Number</label>
                <input
                  className="input"
                  placeholder="e.g. ESIC998877665"
                  value={f.esic_number}
                  onChange={set('esic_number')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name *</label>
                <input
                  className="input"
                  placeholder="First name"
                  value={f.first_name}
                  onChange={set('first_name')}
                  required
                />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input
                  className="input"
                  placeholder="Last name"
                  value={f.last_name}
                  onChange={set('last_name')}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Official Email ID *</label>
              <input
                className="input"
                type="email"
                placeholder="name@ncode.example"
                value={f.email}
                onChange={set('email')}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Department</label>
                <input
                  className="input"
                  value={f.department}
                  onChange={set('department')}
                />
              </div>
              <div>
                <label className="label">Designation</label>
                <input
                  className="input"
                  value={f.designation}
                  onChange={set('designation')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Phone Number</label>
                <input
                  className="input"
                  placeholder="+91 98765 43210"
                  value={f.phone}
                  onChange={set('phone')}
                />
              </div>
              <div>
                <label className="label">Password *</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••••••"
                  value={f.password}
                  onChange={set('password')}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                <p className="whitespace-pre-line">{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full py-2.5 text-sm font-semibold tracking-wide"
              disabled={busy}
            >
              {busy ? 'Registering...' : 'REGISTER EMPLOYEE'}
            </button>

            <p className="text-center text-xs text-slate-500 pt-2">
              Already enrolled?{' '}
              <Link className="font-semibold text-blue-900 hover:text-blue-700 underline" to="/login">
                Return to Login
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
