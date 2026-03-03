'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, Loader2, CheckCircle2, AlertCircle, Upload, X, ImageIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface School {
  id: string;
  name: string;
  abbreviation: string;
}

const CATEGORIES = [
  'Technology & Engineering',
  'Arts & Culture',
  'Sports & Fitness',
  'Community Service',
  'Academic & Research',
  'Media & Communication',
  'Business & Entrepreneurship',
  'Environment & Sustainability',
  'Health & Wellness',
  'Other',
];

export default function RegisterSocietyPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [missionStatement, setMissionStatement] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [presidentName, setPresidentName] = useState('');
  const [email, setEmail] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

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

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setError('Logo must be under 8MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Logo must be an image file');
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !presidentName.trim() || !email.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    if (!category) {
      setError('Please select a category');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Step 1: Upload logo if provided
      let logoUrl: string | undefined;
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        formData.append('type', 'logo');
        formData.append('context', 'society-registration');

        const uploadRes = await fetch('/api/upload/society-media', {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          logoUrl = uploadData.data?.url;
        }
        // Non-fatal if logo upload fails
      }

      // Step 2: Submit registration
      const res = await fetch('/api/societies/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          schoolId: schoolId || undefined,
          description,
          category,
          missionStatement: missionStatement || undefined,
          contactNumber,
          presidentName,
          email,
          logoUrl,
        }),
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

        {/* Society Logo */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">Society Logo</label>
          <div className="flex items-center gap-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer relative group"
              style={{ background: 'var(--bg-input)', border: '2px dashed var(--border-card)' }}
              onClick={() => document.getElementById('logo-input')?.click()}
            >
              {logoPreview ? (
                <>
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <ImageIcon className="w-6 h-6 text-muted" />
                  <span className="text-[10px] text-muted">Upload</span>
                </div>
              )}
            </div>
            {logoFile && (
              <div className="flex-1">
                <p className="text-sm text-primary truncate">{logoFile.name}</p>
                <p className="text-xs text-muted">{(logoFile.size / 1024).toFixed(0)} KB</p>
                <button
                  type="button"
                  onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                  className="text-xs text-red-500 flex items-center gap-1 mt-1"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              </div>
            )}
          </div>
          <input
            id="logo-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoSelect}
          />
          <p className="text-muted text-xs mt-1">Optional. Max 8MB (JPEG, PNG, WebP)</p>
        </div>

        {/* Society Name */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">Society Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., NUST Developers Society"
            className="input-field w-full py-3 px-4 text-sm"
            maxLength={200}
            required
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">Category *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field w-full py-3 px-4 text-sm appearance-none"
            required
          >
            <option value="">Select a category...</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
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
            maxLength={2000}
            required
          />
          <p className="text-muted text-xs mt-1 text-right">{description.length}/2000</p>
        </div>

        {/* Mission Statement */}
        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">Mission Statement</label>
          <textarea
            value={missionStatement}
            onChange={(e) => setMissionStatement(e.target.value)}
            placeholder="Why does this society need to exist? What unique value does it bring?"
            rows={3}
            className="input-field w-full py-3 px-4 text-sm resize-none"
            maxLength={1000}
          />
          <p className="text-muted text-xs mt-1 text-right">{missionStatement.length}/1000</p>
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
