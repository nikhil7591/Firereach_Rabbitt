import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, ArrowRight, Twitter, Instagram, Linkedin } from 'lucide-react';

const getLaunchAppTarget = () => {
  try {
    const session = JSON.parse(window.localStorage.getItem('firereach_session') || 'null');
    return session?.token ? '/app' : '/auth?mode=login';
  } catch {
    return '/auth?mode=login';
  }
};

export default function Footer() {
  return (
    <footer className="relative pt-24 pb-8 px-6">
      {/* CTA Section */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl mx-auto text-center mb-20"
      >
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Ready to Automate Your <span className="italic font-serif text-white/80">Outreach?</span>
        </h2>
        <p className="text-[#A1A1AA] text-base max-w-md mx-auto leading-relaxed font-light mb-8">
          Define your ICP. Deploy the agent. Get personalized B2B outreach in under 3 minutes.
        </p>
        <Link
          to={getLaunchAppTarget()}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity no-underline shadow-lg shadow-indigo-500/25"
        >
          Launch App <ArrowRight className="w-4 h-4" />
        </Link>
      </motion.div>

      {/* Footer Links */}
      <div className="max-w-6xl mx-auto border-t border-white/[0.06] pt-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <Flame className="w-5 h-5 text-orange-500" />
            Fire<span className="text-orange-500">Reach</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm">
            <a href="#features" className="text-[#A1A1AA] hover:text-white transition-colors no-underline">Features</a>
            <a href="#pipeline" className="text-[#A1A1AA] hover:text-white transition-colors no-underline">Pipeline</a>
            <a href="#pricing" className="text-[#A1A1AA] hover:text-white transition-colors no-underline">Pricing</a>
            <a href="https://youtu.be/PiymjG6xOXM" target="_blank" rel="noreferrer" className="text-[#A1A1AA] hover:text-white transition-colors no-underline">Demo</a>
            <a href="mailto:nikhil759100@gmail.com" className="text-[#A1A1AA] hover:text-white transition-colors no-underline">Contact</a>
          </div>

          <div className="flex items-center gap-4">
            <a href="#" className="text-[#A1A1AA] hover:text-white transition-colors"><Twitter className="w-4 h-4" /></a>
            <a href="#" className="text-[#A1A1AA] hover:text-white transition-colors"><Instagram className="w-4 h-4" /></a>
            <a href="https://www.linkedin.com/in/nikhil-kumar-2974292a9/" target="_blank" rel="noreferrer" className="text-[#A1A1AA] hover:text-white transition-colors"><Linkedin className="w-4 h-4" /></a>
          </div>
        </div>

        <div className="text-center mt-10 text-xs text-[#A1A1AA]/50">
          Built by <strong className="text-[#A1A1AA]/70">Nikhil Kumar</strong> · © {new Date().getFullYear()} FireReach. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
