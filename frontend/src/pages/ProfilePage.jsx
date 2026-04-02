import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

import {
  getCurrentUserProfile,
  getCreditsStatus,
  getSearchHistoryList,
  getAccountPlan,
  updateUserProfile,
} from '../services/api';
import SectionWrapper from '../components/ui/SectionWrapper';
import ProfileCard from '../components/ui/ProfileCard';
import StatCard from '../components/ui/StatCard';
import ProgressBar from '../components/ui/ProgressBar';
import {
  getStoredProfileDetails,
  isProfileComplete,
  markProfileCompletionRequired,
  normalizeProfileDetails,
  PROFILE_DETAILS_KEY,
} from '../utils/profile';

const SESSION_KEY = 'firereach_session';

const getSession = () => {
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return 'N/A';
  }
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState(() => getSession());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [credits, setCredits] = useState(null);
  const [history, setHistory] = useState([]);
  const [profileForm, setProfileForm] = useState(() => normalizeProfileDetails(getStoredProfileDetails(), getSession()?.user || {}));
  const [savingProfile, setSavingProfile] = useState(false);

  const token = session?.token || '';
  const onboardingMode = searchParams.get('onboarding') === '1';

  useEffect(() => {
    const sync = () => setSession(getSession());
    window.addEventListener('storage', sync);
    window.addEventListener('firereach-session-updated', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('firereach-session-updated', sync);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!token) {
        setLoading(false);
        setError('Please login again to open profile.');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const [meRes, planRes, creditRes, historyRes] = await Promise.all([
          getCurrentUserProfile(token),
          getAccountPlan(token),
          getCreditsStatus(token),
          getSearchHistoryList(token, 12),
        ]);
        if (!active) return;
        setUser(meRes.user || null);
        // Only update profileForm if it's empty or from stored data
        setProfileForm((prev) => {
          const normalized = normalizeProfileDetails(getStoredProfileDetails(), meRes.user || {});
          // Use stored values if available, otherwise use API values
          return {
            ...normalized,
            company: prev.company || normalized.company,
            role: prev.role || normalized.role,
            website: prev.website || normalized.website,
            icpFocus: prev.icpFocus || normalized.icpFocus,
          };
        });
        setPlan(planRes || null);
        setCredits(creditRes || null);
        setHistory(Array.isArray(historyRes.history) ? historyRes.history : []);
      } catch (loadError) {
        console.error('Profile load failed:', loadError);
        if (active) setError('Unable to load profile details right now.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [token]);

  const planLabel = useMemo(() => {
    const raw = String(plan?.plan || user?.plan || 'FREE').toUpperCase();
    if (raw === 'PRO') return 'Popular';
    if (raw === 'ENTERPRISE') return 'Custom';
    return 'Free';
  }, [plan?.plan, user?.plan]);

  const creditsRemaining = Number(credits?.creditsRemaining ?? user?.creditsRemaining ?? 0);
  const monthlyCredits = Number(credits?.monthlyCredits ?? user?.monthlyCredits ?? 0);
  const usedPercent = monthlyCredits > 0 ? Math.round(((monthlyCredits - creditsRemaining) / monthlyCredits) * 100) : 0;
  const profileCompleted = isProfileComplete(profileForm, user || session?.user || {});

  const saveProfileDetails = async () => {
    const payload = normalizeProfileDetails(profileForm, user || session?.user || {});
    setSaveError('');
    setSaveSuccess('');

    if (!payload.name) {
      setSaveError('Name is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contactEmail)) {
      setSaveError('Valid email id is required.');
      return;
    }
    if (!/^\d{10}$/.test(payload.phone)) {
      setSaveError('Phone number must be exactly 10 digits.');
      return;
    }

    setSavingProfile(true);
    try {
      if (token) {
        const response = await updateUserProfile(token, { name: payload.name });
        const nextSession = {
          ...(getSession() || {}),
          user: response.user,
        };
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
        window.localStorage.setItem('firereach_user', JSON.stringify(response.user));
        setUser(response.user);
      }

      window.localStorage.setItem(PROFILE_DETAILS_KEY, JSON.stringify(payload));
      markProfileCompletionRequired(false);
      window.dispatchEvent(new Event('firereach-session-updated'));
      setSaveSuccess('Profile saved successfully. You can now run outreach flow.');
    } catch (saveProfileError) {
      console.error('Profile save failed:', saveProfileError);
      setSaveError('Unable to save profile right now. Please retry.');
    } finally {
      setSavingProfile(false);
    }
  };

  const recentActivity = history.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.icp,
    when: formatDate(item.createdAt),
  }));

  return (
    <div className="min-h-screen bg-[#050505] relative overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_14%_12%,rgba(99,102,241,0.18),transparent_34%),radial-gradient(circle_at_80%_18%,rgba(249,115,22,0.12),transparent_28%)]" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-300 text-xs uppercase tracking-[0.16em]">FireReach Account</p>
            <h1 className="text-white text-2xl md:text-3xl font-bold">Profile</h1>
          </div>
          <Link to="/" className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white no-underline">Back To Home</Link>
        </div>

        {error && <div className="rounded-lg border border-rose-400/35 bg-rose-500/10 text-rose-300 px-3 py-2 text-sm">{error}</div>}
        {onboardingMode && !profileCompleted && (
          <div className="rounded-lg border border-amber-400/35 bg-amber-500/10 text-amber-200 px-3 py-2 text-sm">
            Complete your profile first. Name, phone number, and email id are mandatory before running the app.
          </div>
        )}
        {loading && <div className="rounded-lg border border-white/10 bg-white/[0.03] text-[#A1A1AA] px-3 py-2 text-sm">Fetching latest profile data...</div>}

        <div id="profile-completion-form">
        <SectionWrapper title="Profile Completion" subtitle="Mandatory details required for personalized email outreach.">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[#A1A1AA] text-xs uppercase tracking-[0.12em]">Mandatory</p>
              <input
                className="w-full rounded-lg border border-white/15 bg-white/5 text-white px-3 py-2"
                placeholder="Full Name *"
                value={profileForm.name}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-white/15 bg-white/5 text-white px-3 py-2"
                placeholder="Phone Number *"
                value={profileForm.phone}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-white/15 bg-white/5 text-white px-3 py-2"
                placeholder="Email ID *"
                value={profileForm.contactEmail}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <p className="text-[#A1A1AA] text-xs uppercase tracking-[0.12em]">Optional</p>
              <input
                className="w-full rounded-lg border border-white/15 bg-white/5 text-white px-3 py-2"
                placeholder="Company"
                value={profileForm.company}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, company: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-white/15 bg-white/5 text-white px-3 py-2"
                placeholder="Role"
                value={profileForm.role}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, role: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-white/15 bg-white/5 text-white px-3 py-2"
                placeholder="Website"
                value={profileForm.website}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, website: event.target.value }))}
              />
              <textarea
                className="w-full rounded-lg border border-white/15 bg-white/5 text-white px-3 py-2 min-h-[90px]"
                placeholder="ICP Focus / Best-fit customer notes"
                value={profileForm.icpFocus}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, icpFocus: event.target.value }))}
              />
            </div>
          </div>
          {saveError && <div className="mt-3 rounded-lg border border-rose-400/35 bg-rose-500/10 text-rose-300 px-3 py-2 text-sm">{saveError}</div>}
          {saveSuccess && <div className="mt-3 rounded-lg border border-emerald-400/35 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm">{saveSuccess}</div>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={saveProfileDetails}
              disabled={savingProfile}
              className="rounded-lg border border-indigo-400/45 bg-indigo-500/20 text-white text-sm px-4 py-2"
            >
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
            <span className="text-xs text-[#A1A1AA]">Status: {profileCompleted ? 'Completed' : 'Incomplete'}</span>
          </div>
        </SectionWrapper>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SectionWrapper title="Account Overview" subtitle="Identity and plan details" delay={0.02}>
              <ProfileCard
                name={user?.name}
                email={user?.email}
                planLabel={planLabel}
                joinDate={formatDate(user?.createdAt)}
                avatarUrl=""
              />
            </SectionWrapper>
          </div>

          <SectionWrapper title="Actions" subtitle="Quick account actions" delay={0.06}>
            <div className="space-y-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                onClick={() => document.getElementById('profile-completion-form')?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-3 py-2 text-white text-sm"
              >
                Edit Profile
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                onClick={() => navigate('/#pricing')}
                className="w-full rounded-lg border border-orange-400/40 bg-orange-500/20 px-3 py-2 text-white text-sm"
              >
                Upgrade Plan
              </motion.button>
            </div>
          </SectionWrapper>
        </div>

        <SectionWrapper title="Credits & Usage" subtitle="Current cycle credit consumption" delay={0.1}>
          <div className="grid md:grid-cols-3 gap-3">
            <StatCard label="Credits Remaining" value={creditsRemaining} accent="orange" />
            <StatCard label="Monthly Credits" value={monthlyCredits} accent="indigo" />
            <StatCard label="Next Reset" value={formatDate(credits?.nextResetAt || plan?.nextResetAt || user?.nextResetAt)} accent="emerald" />
          </div>
          <div className="mt-4">
            <ProgressBar value={usedPercent} />
          </div>
        </SectionWrapper>

        <div className="grid lg:grid-cols-3 gap-4">
          <SectionWrapper title="Activity" subtitle="Recent account events" delay={0.14}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <StatCard label="Last Login" value={formatDate(session?.user?.updatedAt || user?.updatedAt)} />
              <StatCard label="History Items" value={history.length} />
            </div>

            <div className="space-y-2">
              {recentActivity.length === 0 && <p className="text-[#A1A1AA] text-sm">No recent activity found.</p>}
              {recentActivity.map((item) => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-white text-sm line-clamp-2">{item.title}</p>
                  <p className="text-[#A1A1AA] text-xs mt-1">{item.when}</p>
                </div>
              ))}
            </div>
          </SectionWrapper>

          <SectionWrapper title="Plan Summary" subtitle="Subscription status at a glance" delay={0.18}>
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
                <span className="text-[#A1A1AA]">Current Plan</span>
                <span className="text-white font-semibold">{planLabel}</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
                <span className="text-[#A1A1AA]">Email</span>
                <span className="text-white font-semibold truncate pl-3">{user?.email || 'N/A'}</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
                <span className="text-[#A1A1AA]">User ID</span>
                <span className="text-white font-semibold truncate pl-3">{user?.id || 'N/A'}</span>
              </div>
            </div>
          </SectionWrapper>
        </div>
      </div>
    </div>
  );
}
