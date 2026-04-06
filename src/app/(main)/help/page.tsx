'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, HelpCircle, MessageCircle, FileText, Mail, Linkedin, ShieldCheck, Clock3, ListChecks, Rocket } from 'lucide-react';
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
            { icon: MessageCircle, label: 'WhatsApp', desc: '03402399943' },
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
            <motion.div
              key={dev.email}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (i + 7) * 0.05 }}
              className="p-4 card"
            >
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-brand-500" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-primary truncate">{dev.name}</h3>
                  <a href={`mailto:${dev.email}`} className="text-xs text-muted truncate hover:text-brand-500 transition-colors">
                    {dev.email}
                  </a>
                </div>
                {dev.name === 'Maaz Hussain' ? (
                  <a
                    href="https://www.linkedin.com/in/maaz-hussain-5aa14b329/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-400"
                  >
                    <Linkedin className="w-4 h-4" /> LinkedIn
                  </a>
                ) : (
                  <span className="text-[11px] text-muted">LinkedIn soon</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        <h2 className="px-1 mt-8 mb-3 text-xs font-semibold tracking-wider uppercase text-muted">
          About Us
        </h2>
        <div className="space-y-2">
          <div className="p-4 card">
            <p className="text-sm font-semibold text-primary">Our Mission</p>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              We are building a reliable digital operations platform for NUST societies to manage governance,
              events, ticketing, and QR-based entry control from one place.
            </p>
          </div>

          <div className="p-4 card">
            <p className="text-sm font-semibold text-primary">What We Built</p>
            <ul className="mt-2 space-y-1 text-xs text-muted list-disc pl-4">
              <li>Society hierarchy and privilege-based governance</li>
              <li>Event lifecycle management and approval workflows</li>
              <li>Paid and free ticketing with proof verification</li>
              <li>QR-based attendance scanning and check-in records</li>
              <li>Azure Blob media support for large image assets</li>
            </ul>
          </div>

          <div className="p-4 card">
            <p className="text-sm font-semibold text-primary">Reliability & Support Promise</p>
            <div className="mt-2 space-y-1 text-xs text-muted">
              <p className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5 text-brand-500" /> Response target: within 24-48 hours</p>
              <p className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5 text-brand-500" /> Support hours: Mon-Fri, 10:00 AM to 6:00 PM</p>
              <p className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-brand-500" /> Event-day urgent issues are prioritized</p>
            </div>
          </div>

          <div className="p-4 card">
            <p className="text-sm font-semibold text-primary">Security & Privacy Commitment</p>
            <div className="mt-2 space-y-1 text-xs text-muted">
              <p>Role-based access is enforced across sensitive workflows.</p>
              <p>Operational data is stored in SQL while large media is managed through Azure Blob.</p>
              <p>User data is handled only for authorized platform operations.</p>
            </div>
          </div>

          <div className="p-4 card">
            <p className="text-sm font-semibold text-primary">How to Report an Issue</p>
            <ul className="mt-2 space-y-1 text-xs text-muted list-disc pl-4">
              <li>Your account email</li>
              <li>Screenshot/video of the issue</li>
              <li>Event ID or Ticket ID (if relevant)</li>
              <li>Device model and browser</li>
              <li>Approximate time when the issue happened</li>
            </ul>
          </div>

          <div className="p-4 card">
            <p className="text-sm font-semibold text-primary">Roadmap</p>
            <div className="mt-2 space-y-1 text-xs text-muted">
              <p className="flex items-center gap-2"><Rocket className="w-3.5 h-3.5 text-brand-500" /> Deeper analytics for societies and events</p>
              <p className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-brand-500" /> Better moderation and support tooling</p>
              <p className="flex items-center gap-2"><Rocket className="w-3.5 h-3.5 text-brand-500" /> Continued mobile UX and performance improvements</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
