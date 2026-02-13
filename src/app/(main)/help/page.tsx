'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, HelpCircle, MessageCircle, FileText, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function HelpPage() {
  const router = useRouter();

  const faqs = [
    { q: 'How do I join a society?', a: 'Visit the society page and tap "Join Society". Your request will be reviewed by the society admin.' },
    { q: 'How do I buy tickets?', a: 'Go to the event page and tap the "Buy Ticket" button at the bottom. Follow the payment flow.' },
    { q: 'How do I create an event?', a: 'Society presidents can create events from their society dashboard. Events require admin approval before publishing.' },
    { q: 'Can I get a refund?', a: 'Refunds are handled by the society that hosted the event. Contact them through the society page.' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl" style={{ background: 'var(--bg-card)' }}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-xl font-bold text-primary">Help & Support</h1>
      </div>

      <div className="px-5 pb-32">
        <h2 className="text-muted text-xs font-semibold uppercase tracking-wider mb-3 mt-4 px-1">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <motion.details
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 group"
            >
              <summary className="flex items-center gap-3 cursor-pointer list-none">
                <HelpCircle className="w-5 h-5 text-brand-500 flex-shrink-0" />
                <span className="text-primary text-sm font-medium flex-1">{faq.q}</span>
              </summary>
              <p className="text-muted text-xs mt-3 ml-8 leading-relaxed">{faq.a}</p>
            </motion.details>
          ))}
        </div>

        <h2 className="text-muted text-xs font-semibold uppercase tracking-wider mb-3 mt-8 px-1">
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
              className="card p-4 flex items-center gap-3"
            >
              <item.icon className="w-5 h-5 text-brand-500" />
              <div className="flex-1">
                <h3 className="text-primary text-sm font-medium">{item.label}</h3>
                <p className="text-muted text-xs">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
