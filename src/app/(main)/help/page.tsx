'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, HelpCircle, MessageCircle, FileText, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function HelpPage() {
  const router = useRouter();

  const developers = [
    { name: 'Maaz Hussain', email: 'maazhussain972@gmail.com' },
    { name: 'Muhammad Abdul Daym', email: 'abduldaym786@gmail.com' },
    { name: 'Muhammad Bilal Atif', email: 'bilalatif23@gmail.com' },
  ];

  const faqs = [
    { q: 'How do I join a society?', a: 'Visit the society page and tap "Join Society". Your request will be reviewed by the society admin.' },
    { q: 'How do I buy tickets?', a: 'Go to the event page and tap the "Buy Ticket" button at the bottom. Follow the payment flow.' },
    { q: 'How do I create an event?', a: 'Society presidents can create events from their society dashboard. Events require admin approval before publishing.' },
    { q: 'Can I get a refund?', a: 'Refunds are handled by the society that hosted the event. Contact them through the society page.' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex items-center gap-3 px-5 pt-12 pb-4">
        <button onClick={() => router.back()} className="p-2 rounded-xl" style={{ background: 'var(--bg-card)' }}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-xl font-bold text-primary">Help & Support</h1>
      </div>

      <div className="px-5 pb-32">
        <h2 className="px-1 mt-4 mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <motion.details
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-4 card group"
            >
              <summary className="flex items-center gap-3 list-none cursor-pointer">
                <HelpCircle className="flex-shrink-0 w-5 h-5 text-brand-500" />
                <span className="flex-1 text-sm font-medium text-primary">{faq.q}</span>
              </summary>
              <p className="mt-3 ml-8 text-xs leading-relaxed text-muted">{faq.a}</p>
            </motion.details>
          ))}
        </div>

        <h2 className="px-1 mt-8 mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
          Contact Us
        </h2>
        <div className="space-y-2">
          {[
            { icon: Mail, label: 'Email Support', desc: 'support@nust.edu.pk' },
            { icon: MessageCircle, label: 'WhatsApp', desc: '+92 300 1234567' },
            { icon: FileText, label: 'Documentation', desc: 'docs.nust-events.pk' },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (i + 4) * 0.05 }}
              className="flex items-center gap-3 p-4 card"
            >
              <item.icon className="w-5 h-5 text-brand-500" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-primary">{item.label}</h3>
                <p className="text-xs text-muted">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <h2 className="px-1 mt-8 mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
          Meet the Developers
        </h2>
        <div className="space-y-2">
          <div className="p-4 card">
            <p className="text-sm font-semibold text-primary">Facing an issue?</p>
            <p className="text-xs text-muted mt-1">
              If there are app issues, contact the development team via email.
            </p>
          </div>
          {developers.map((dev, i) => (
            <motion.a
              key={dev.email}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (i + 7) * 0.05 }}
              href={`mailto:${dev.email}`}
              className="flex items-center gap-3 p-4 card hover:border-brand-500/30 transition-colors"
            >
              <Mail className="w-5 h-5 text-brand-500" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-primary truncate">{dev.name}</h3>
                <p className="text-xs text-muted truncate">{dev.email}</p>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </div>
  );
}
