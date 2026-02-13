'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Shield, Eye, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PrivacyPage() {
  const router = useRouter();

  const items = [
    { icon: Eye, label: 'Profile Visibility', desc: 'Who can see your profile', value: 'Everyone' },
    { icon: Lock, label: 'Event History', desc: 'Who can see your attended events', value: 'Only Me' },
    { icon: Shield, label: 'Data Sharing', desc: 'Share usage data for improvements', value: 'Enabled' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl" style={{ background: 'var(--bg-card)' }}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-xl font-bold text-primary">Privacy & Security</h1>
      </div>

      <div className="px-5 pb-32 space-y-2 mt-4">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <item.icon className="w-5 h-5 text-brand-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-primary text-sm font-medium">{item.label}</h3>
              <p className="text-muted text-xs">{item.desc}</p>
            </div>
            <span className="text-muted text-xs">{item.value}</span>
          </motion.div>
        ))}

        <div className="mt-8 card p-5">
          <h3 className="text-primary text-sm font-semibold mb-2">Data Policy</h3>
          <p className="text-muted text-xs leading-relaxed">
            NUST Event Management collects minimal data necessary for providing event and society management services.
            Your data is stored securely on Azure and is never shared with third parties without your consent.
          </p>
        </div>
      </div>
    </div>
  );
}
