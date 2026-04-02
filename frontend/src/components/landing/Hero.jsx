import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Volume2, VolumeX, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

const getLaunchAppTarget = () => {
  try {
    const session = JSON.parse(window.localStorage.getItem('firereach_session') || 'null');
    return session?.token ? '/app' : '/auth?mode=login';
  } catch {
    return '/auth?mode=login';
  }
};

export default function Hero() {
  const videoRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    const video = videoRef.current;
    let cancelled = false;

    const attemptPlay = async () => {
      if (cancelled) {
        return;
      }

      video.muted = isMuted;
      video.volume = 1;

      try {
        await video.play();
      } catch {
        if (!isMuted) {
          // Browser blocked autoplay with sound; fallback to muted autoplay.
          video.muted = true;
          setIsMuted(true);
          try {
            await video.play();
          } catch {
            // Ignore repeated autoplay failures.
          }
        }
      }
    };

    const onLoadedData = () => {
      attemptPlay();
    };

    if (video.readyState >= 2) {
      attemptPlay();
    } else {
      video.addEventListener('loadeddata', onLoadedData);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        attemptPlay();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', onLoadedData);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isMuted]);

  return (
    <section className="relative min-h-screen px-6 pt-20 pb-12 overflow-hidden">
      {/* Radial Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[radial-gradient(circle,rgba(99,102,241,0.15)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(168,85,247,0.1)_0%,transparent_70%)] pointer-events-none" />

      <div className="max-w-[1400px] mx-auto min-h-[calc(100vh-7rem)] flex items-start">
        <div className="grid grid-cols-1 lg:grid-cols-[0.78fr_1.22fr] gap-8 lg:gap-12 items-start w-full">
          <div className="text-center lg:text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold tracking-wider uppercase mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Autonomous AI Outreach Engine
            </motion.div>

            {/* H1 */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-5"
            >
              ICP to Inbox.{' '}
              <br className="hidden sm:block" />
              Zero Manual Effort.{' '}
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent italic font-serif">
                With AI.
              </span>
            </motion.h1>

            {/* Subtext */}
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-[#A1A1AA] text-sm sm:text-base lg:text-lg max-w-xl leading-relaxed mb-9 font-light mx-auto lg:mx-0"
            >
              Define your Ideal Customer Profile. Deploy the 7-step AI agent. Personalized B2B outreach delivered in under 3 minutes.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-4 justify-center lg:justify-start"
            >
              <Link
                to={getLaunchAppTarget()}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity no-underline shadow-lg shadow-indigo-500/25"
              >
                <Zap className="w-4 h-4" /> Launch App
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://youtu.be/PiymjG6xOXM"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg border border-white/10 text-[#A1A1AA] font-medium text-sm hover:text-white hover:border-white/20 transition-all no-underline"
              >
                ▶ Watch Demo
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap gap-8 sm:gap-14 mt-12 pt-8 border-t border-white/[0.06] justify-center lg:justify-start"
            >
              {[
                { val: '7', lbl: 'Agent Steps' },
                { val: '<3min', lbl: 'Full Pipeline' },
                { val: 'Zero', lbl: 'Manual Effort' },
                { val: 'Live', lbl: 'Streaming UX' },
              ].map((s) => (
                <div key={s.lbl} className="text-center lg:text-left">
                  <div className="text-2xl sm:text-3xl font-bold text-white">{s.val}</div>
                  <div className="text-xs text-[#A1A1AA] mt-1 font-medium">{s.lbl}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="relative lg:-mt-6 w-full"
          >
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-indigo-500/20 via-purple-500/10 to-pink-500/20 blur-2xl pointer-events-none" />
            <div className="relative rounded-3xl border border-white/15 bg-black/50 backdrop-blur-md p-2.5 shadow-2xl shadow-black/50">
              <video
                ref={videoRef}
                className="w-full aspect-video sm:h-[330px] lg:h-[430px] xl:h-[490px] rounded-2xl border border-white/10 object-contain sm:object-cover bg-black"
                src="/FireReach Video.mp4"
                autoPlay
                loop
                muted={isMuted}
                playsInline
              />
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                className="absolute right-5 bottom-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/85 transition-colors"
                aria-label={isMuted ? 'Unmute video audio' : 'Mute video audio'}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {isMuted ? 'Sound Off' : 'Sound On'}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
