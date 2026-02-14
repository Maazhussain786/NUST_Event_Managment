'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface School {
  id: string;
  name: string;
  abbreviation: string;
}

export default function RegisterSocietyPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [description, setDescription] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [presidentName, setPresidentName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    fetch('/api/schools').then(r => r.json()).then(d => setSchools(d.schools || []));
    // Pre-fill email from localStorage
    try {
      const user = localStorage.getItem('user');
      if (user) {
        const parsed = JSON.parse(user);
        setEmail(parsed.email || '');
        setPresidentName(parsed.fullName || '');
      }
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !presidentName.trim() || !email.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/societies/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, schoolId: schoolId || undefined, description, contactNumber, presidentName, email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-primary)' }}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card p-8 text-center max-w-sm w-full"
        >
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-primary mb-2">Application Submitted!</h2>
          <p className="text-muted text-sm mb-6">
            Your society registration is under review. You&apos;ll be notified once a Super Admin approves it.
          </p>
          <button
            onClick={() => router.push('/societies')}
            className="btn-primary w-full py-3 rounded-xl text-sm font-semibold"
          >
            Back to Societies
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-card)' }}>
        <button onClick={() => router.back()} className="p-2 rounded-xl" style={{ background: 'var(--bg-card)' }}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">Register Society</h1>
          <p className="text-muted text-xs">Submit your society for approval</p>
        </div>
        <Building2 className="w-6 h-6 text-brand-500" />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-5 py-6 space-y-5">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 text-red-500 text-sm"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </motion.div>
        )}

        {/* Society Name */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">Society Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., NUST Developers Society"
            className="input-field w-full py-3 px-4 text-sm"
            required
          />
        </div>

        {/* School */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">School</label>
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="input-field w-full py-3 px-4 text-sm appearance-none"
          >
            <option value="">NUST-Wide (no specific school)</option>
            {schools.map(s => (
              <option key={s.id} value={s.id}>{s.abbreviation} — {s.name}</option>
            ))}
          </select>
          <p className="text-muted text-xs mt-1">Leave empty if the society is open to all schools</p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your society's purpose, activities, and goals..."
            rows={4}
            className="input-field w-full py-3 px-4 text-sm resize-none"
            required
          />
        </div>

        {/* President Name */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">President Name *</label>
          <input
            type="text"
            value={presidentName}
            onChange={(e) => setPresidentName(e.target.value)}
            placeholder="Your full name"
            className="input-field w-full py-3 px-4 text-sm"
            required
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">President Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@seecs.edu.pk"
            className="input-field w-full py-3 px-4 text-sm"
            required
          />
        </div>

        {/* Contact Number */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">Contact Number</label>
          <input
            type="tel"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            placeholder="03XX-XXXXXXX"
            className="input-field w-full py-3 px-4 text-sm"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Application'
            )}
          </button>
          <p className="text-muted text-xs text-center mt-3">
            Applications are reviewed by Super Admins within 1-3 business days.
          </p>
        </div>
      </form>
    </div>
  );
}
