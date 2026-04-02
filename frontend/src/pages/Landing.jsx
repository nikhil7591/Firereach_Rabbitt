import { useEffect } from 'react';
import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import IntroQuote from '../components/landing/IntroQuote';
import Services from '../components/landing/Services';
import Pipeline from '../components/landing/Pipeline';
import SuccessStories from '../components/landing/SuccessStories';
import ComparisonTable from '../components/landing/ComparisonTable';
import Pricing from '../components/landing/Pricing';
import Team from '../components/landing/Team';
import FAQ from '../components/landing/FAQ';
import Footer from '../components/landing/Footer';
import ScrollReveal from '../components/ScrollReveal';
import './Landing.css';

function Landing() {
  useEffect(() => {
    const hash = String(window.location.hash || '').trim();
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    const scrollToHashTarget = () => {
      const target = document.querySelector(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    // Wait for sections to render before scrolling to hash target.
    window.requestAnimationFrame(() => {
      window.setTimeout(scrollToHashTarget, 60);
    });
  }, []);

  return (
    <div className="landing-page">
      <div className="landing-noise" />

      <Navbar />

      <ScrollReveal>
        <Hero />
      </ScrollReveal>

      <ScrollReveal delay={100}>
        <IntroQuote />
      </ScrollReveal>

      <ScrollReveal>
        <Services />
      </ScrollReveal>

      <ScrollReveal>
        <Pipeline />
      </ScrollReveal>

      <ScrollReveal>
        <SuccessStories />
      </ScrollReveal>

      <ScrollReveal>
        <ComparisonTable />
      </ScrollReveal>

      <ScrollReveal>
        <Pricing />
      </ScrollReveal>

      <ScrollReveal>
        <Team />
      </ScrollReveal>

      <ScrollReveal>
        <FAQ />
      </ScrollReveal>

      <Footer />
    </div>
  );
}

export default Landing;
