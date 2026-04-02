import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  CircleDashed,
  Copy,
  Cpu,
  EllipsisVertical,
  History,
  LoaderCircle,
  Mail,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import './App.css';
import api, { API_URL } from './services/api';
import {
  getStoredProfileDetails,
  isProfileComplete,
  markProfileCompletionRequired,
  normalizeProfileDetails,
} from './utils/profile';

const {
  runAgentStream,
  selectCompany,
  sendGeneratedEmail,
  getCreditsStatus,
  consumeCredits,
  saveSearchHistory,
  getSearchHistoryList,
  getSearchHistoryItem,
  renameSearchHistoryItem,
  deleteSearchHistoryItem,
} = api;
const PDF_BASE_URL = API_URL;
const SESSION_STORAGE_KEY = 'firereach_session';
const PREF_KEY = 'firereach_outreach_preferences';

const getStoredSession = () => {
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
};

const getStoredPreferences = () => {
  try {
    return JSON.parse(window.localStorage.getItem(PREF_KEY) || '{}');
  } catch {
    return {};
  }
};

const toUserSafeErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const status = Number(error?.response?.status || 0);
  const detail = error?.response?.data?.detail;
  const message = typeof detail === 'string'
    ? detail
    : error?.response?.data?.message || error?.message || '';
  const lowered = String(message || '').toLowerCase();

  if (status === 429 || lowered.includes('rate limit') || lowered.includes('rate_limit_exceeded')) {
    return 'The AI service is busy right now. Please retry in a few seconds.';
  }
  if (status >= 500) {
    return 'Server is temporarily unavailable. Please retry shortly.';
  }
  if (status === 401) {
    return 'Session expired. Please login again.';
  }
  return fallback;
};

const STEP_CONFIG = [
  { id: 'step1', label: 'Step 1: Finding companies...' },
  { id: 'step2', label: 'Step 2: Harvesting signals...' },
  { id: 'step3', label: 'Step 3: Verifying signals...' },
  { id: 'step4', label: 'Step 4: Analyzing research...' },
  { id: 'step5', label: 'Step 5: Selecting best company...' },
  { id: 'step6', label: 'Step 6: Finding emails...' },
  { id: 'step7', label: 'Step 7: Sending outreach...' },
];

const createInitialSteps = () => STEP_CONFIG.map((step) => ({ ...step, status: 'pending', message: '' }));

const confidenceToScore = (confidence) => {
  const raw = String(confidence ?? '').trim().toLowerCase();
  if (/^\d+$/.test(raw)) {
    return Math.max(0, Math.min(100, Number(raw)));
  }
  if (raw === 'high') return 90;
  if (raw === 'medium') return 70;
  if (raw === 'low') return 40;
  return 0;
};

const confidenceTone = (confidence) => {
  const score = confidenceToScore(confidence);
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
};

const confidenceLabel = (confidence) => {
  const score = confidenceToScore(confidence);
  return score > 0 ? `${score}%` : String(confidence || 'N/A').toUpperCase();
};

const toTitleCase = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

const firstNameFromEmail = (email) => {
  const rawEmail = String(email || '').trim();
  if (!rawEmail || !rawEmail.includes('@')) {
    return '';
  }

  const localPart = rawEmail.split('@')[0] || '';
  const firstToken = localPart
    .split(/[._+\-\d]+/)
    .map((token) => token.trim())
    .find((token) => /^[a-zA-Z]+$/.test(token));

  return toTitleCase(firstToken);
};

const companyInitials = (companyName) => {
  const parts = String(companyName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

const normalizeLogoUrl = (logoUrl) => {
  const raw = String(logoUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return '';
};

const extractDomainFromCompany = (companyLike) => {
  const directDomain = String(companyLike?.domain || '').trim().toLowerCase();
  if (directDomain) {
    return directDomain.replace(/^www\./, '');
  }

  const rawWebsite = String(companyLike?.website || '').trim();
  if (!rawWebsite) {
    return '';
  }

  try {
    const normalized = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;
    const parsed = new URL(normalized);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

const companyFaviconUrl = (companyLike) => {
  const domain = extractDomainFromCompany(companyLike);
  if (!domain) {
    return '';
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
};

const resolveCompanyVisualUrl = (companyLike) => {
  return normalizeLogoUrl(companyLike?.company_icon)
    || companyFaviconUrl(companyLike)
    || normalizeLogoUrl(companyLike?.company_logo)
    || '';
};

const normalizeAvatarUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return /^https?:\/\//i.test(raw) ? raw : '';
};

const resolveContactAvatar = (contact) => {
  const explicit = normalizeAvatarUrl(contact?.avatar_url)
    || normalizeAvatarUrl(contact?.photo_url)
    || normalizeAvatarUrl(contact?.image_url)
    || normalizeAvatarUrl(contact?.profile_image);
  if (explicit) {
    return explicit;
  }

  const linkedinUrl = normalizeAvatarUrl(contact?.linkedin_url);
  if (linkedinUrl) {
    return `https://unavatar.io/linkedin/${encodeURIComponent(linkedinUrl)}`;
  }

  return '';
};

const contactInitials = (name, email) => {
  const safeName = String(name || '').trim();
  if (safeName) {
    const words = safeName.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }

  const local = String(email || '').split('@')[0] || '';
  return local.slice(0, 2).toUpperCase() || 'NA';
};

const deriveHistoryOutreach = (company, historyResult) => {
  const outreach = company?.outreach || {};
  if (outreach?.status) {
    return {
      ...outreach,
      status: String(outreach.status),
      message: String(outreach.message || '').trim() || 'Delivery data recorded.',
    };
  }

  const sendMode = String(historyResult?.send_mode || '').toLowerCase();
  const isSelected = company?.company_name && company.company_name === historyResult?.selected_company_name;

  if (sendMode === 'manual') {
    return {
      status: isSelected ? 'manual_pending' : 'not_selected',
      message: isSelected
        ? 'Selected in manual mode. Send action was not executed in this run.'
        : 'Company was not selected in manual mode.',
      subject: '',
      email_content: '',
      recipient: '',
    };
  }

  if (isSelected) {
    return {
      status: 'not_sent',
      message: 'Selected company exists, but send output was not persisted for this run.',
      subject: '',
      email_content: '',
      recipient: '',
    };
  }

  return {
    status: 'not_selected',
    message: 'Company was not selected for send step in this run.',
    subject: '',
    email_content: '',
    recipient: '',
  };
};

const resolveRecipientName = (contactName, testRecipientOverride) => {
  const testName = firstNameFromEmail(testRecipientOverride);
  if (testName) {
    return testName;
  }

  return String(contactName || '').trim();
};

const getSenderProfile = (sessionUser = {}) => normalizeProfileDetails(getStoredProfileDetails(), sessionUser);

const applySenderSignature = (body, senderProfile) => {
  const currentBody = extractBodyFromJsonLike(body);
  const profile = normalizeProfileDetails(senderProfile || {}, {});
  const senderName = profile.name || 'Nikhil Kumar';
  const senderEmail = profile.contactEmail || 'nikhil759100@gmail.com';
  const senderPhone = profile.phone || '+91-7807946374';
  const senderTitle = profile.role && profile.company
    ? `${profile.role}, ${profile.company}`
    : profile.company
      ? profile.company
      : 'Founder, FireReach';

  const signature = [
    'Best regards,',
    senderName,
    senderTitle,
    `Phone: ${senderPhone}`,
    `Email: ${senderEmail}`,
  ].join('\n');

  const strippedBody = currentBody.replace(/\n*Best regards,[\s\S]*$/i, '').trim();
  return `${strippedBody}\n\n${signature}`.trim();
};

const isStandaloneNameLine = (line) => /^[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3},?$/.test(String(line || '').trim());

const extractBodyFromJsonLike = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    let directParsed = JSON.parse(withoutFence);
    if (typeof directParsed === 'string') {
      const nested = directParsed.trim();
      if (nested.startsWith('{') && nested.endsWith('}')) {
        directParsed = JSON.parse(nested);
      }
    }
    if (typeof directParsed?.body === 'string' && directParsed.body.trim()) {
      return directParsed.body.trim();
    }
    if (typeof directParsed?.email_content === 'string' && directParsed.email_content.trim()) {
      return directParsed.email_content.trim();
    }
  } catch {
    // Keep fallback parsing below.
  }

  const bodyRegexMatch = withoutFence.match(/"body"\s*:\s*"([\s\S]*?)"\s*}\s*$/);
  if (bodyRegexMatch?.[1]) {
    return bodyRegexMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
  }

  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return raw;
  }

  try {
    let parsed = JSON.parse(withoutFence.slice(start, end + 1));
    if (typeof parsed === 'string') {
      const nested = parsed.trim();
      if (nested.startsWith('{') && nested.endsWith('}')) {
        parsed = JSON.parse(nested);
      }
    }
    if (typeof parsed?.body === 'string' && parsed.body.trim()) {
      return parsed.body.trim();
    }
    if (typeof parsed?.email_content === 'string' && parsed.email_content.trim()) {
      return parsed.email_content.trim();
    }
  } catch {
    return raw;
  }

  return raw;
};

function App() {
  const [session, setSession] = useState(() => getStoredSession());
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionToken = session?.token || '';

  const [icp, setIcp] = useState('We sell high-end cybersecurity training to Series B startups.');
  const [targetCompany, setTargetCompany] = useState('');
  const [testRecipientEmail, setTestRecipientEmail] = useState(() => String(getStoredPreferences().defaultTestEmail || ''));
  const [steps, setSteps] = useState(createInitialSteps);
  const [result, setResult] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [liveCompanies, setLiveCompanies] = useState([]);
  const [liveRankings, setLiveRankings] = useState([]);
  const [liveSelectedCompanyName, setLiveSelectedCompanyName] = useState('');
  const [liveContacts, setLiveContacts] = useState([]);
  const [liveSuggestedContact, setLiveSuggestedContact] = useState({});
  const [liveOutreachPreview, setLiveOutreachPreview] = useState(null);
  const [liveRecipientOverride, setLiveRecipientOverride] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendMode, setSendMode] = useState(() => {
    const stored = String(getStoredPreferences().defaultSendMode || '').toLowerCase();
    return stored === 'manual' ? 'manual' : 'auto';
  });
  const [manualSendingMap, setManualSendingMap] = useState({});
  const [selectingCompanyMap, setSelectingCompanyMap] = useState({});
  const [selectedRecipientMap, setSelectedRecipientMap] = useState({});
  const [baseTemplateMap, setBaseTemplateMap] = useState({});
  const [editingTemplateMap, setEditingTemplateMap] = useState({});
  const [templateDrafts, setTemplateDrafts] = useState({});
  const [pdfPreviewModal, setPdfPreviewModal] = useState(null);
  const [error, setError] = useState('');
  const [copiedEmailKey, setCopiedEmailKey] = useState('');
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyItems, setHistoryItems] = useState([]);
  const [historyMenuOpenFor, setHistoryMenuOpenFor] = useState('');
  const [historyRenamingId, setHistoryRenamingId] = useState('');
  const [historyRenameDraft, setHistoryRenameDraft] = useState('');
  const [historyDetailLoadingId, setHistoryDetailLoadingId] = useState('');
  const [historyDetailItem, setHistoryDetailItem] = useState(null);
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);
  const [creditsInfo, setCreditsInfo] = useState({
    plan: String(session?.user?.plan || 'FREE').toUpperCase(),
    creditsRemaining: Number(session?.user?.creditsRemaining || 0),
    monthlyCredits: Number(session?.user?.monthlyCredits || 0),
    nextResetAt: session?.user?.nextResetAt || null,
  });

  const progressValue = steps.reduce((total, step) => {
    if (step.status === 'completed') {
      return total + 1;
    }
    if (step.status === 'in-progress') {
      return total + 0.5;
    }
    return total;
  }, 0);
  const progressPercent = Math.round((progressValue / steps.length) * 100);
  const activeStep = steps.find((step) => step.status === 'in-progress')
    || steps.find((step) => step.status === 'failed')
    || steps.find((step) => step.status === 'completed')
    || steps[0];

  const updateStep = (stepId, status, message = '') => {
    setSteps((currentSteps) => currentSteps.map((step) => (
      step.id === stepId ? { ...step, status, message } : step
    )));
  };

  const markRunningStepFailed = (message) => {
    setSteps((currentSteps) => currentSteps.map((step) => (
      step.status === 'in-progress' ? { ...step, status: 'failed', message } : step
    )));
  };

  const hydrateTemplateAndRecipients = (workflowData) => {
    const recipientSelection = {};
    const templateBase = {};

    (workflowData?.companies || []).forEach((company) => {
      if (workflowData?.send_mode === 'auto') {
        recipientSelection[company.company_name] = company.selected_contact?.email || '';
      } else {
        recipientSelection[company.company_name] = '';
      }

      templateBase[company.company_name] = {
        subject: company.outreach?.subject || '',
        email_content: extractBodyFromJsonLike(company.outreach?.email_content || ''),
      };
    });

    setSelectedRecipientMap(recipientSelection);
    setBaseTemplateMap(templateBase);
  };

  useEffect(() => {
    setSession(getStoredSession());
  }, []);

  useEffect(() => {
    const sync = async () => {
      const latestSession = getStoredSession();
      setSession(latestSession);
      const token = latestSession?.token;
      if (!token) {
        return;
      }
      try {
        const status = await getCreditsStatus(token);
        setCreditsInfo({
          plan: String(status.plan || 'FREE').toUpperCase(),
          creditsRemaining: Number(status.creditsRemaining || 0),
          monthlyCredits: Number(status.monthlyCredits || 0),
          nextResetAt: status.nextResetAt || null,
        });

        const nextSession = {
          ...latestSession,
          user: {
            ...(latestSession?.user || {}),
            plan: String(status.plan || 'FREE').toUpperCase(),
            creditsRemaining: Number(status.creditsRemaining || 0),
            monthlyCredits: Number(status.monthlyCredits || 0),
            nextResetAt: status.nextResetAt || null,
            plus: ['PRO', 'ENTERPRISE'].includes(String(status.plan || '').toUpperCase()),
          },
        };
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      } catch {
        // Keep existing local credits if fetch fails.
      }
    };

    sync();
    window.addEventListener('firereach-session-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('firereach-session-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const hydrateFromHistory = useCallback((history) => {
    if (!history?.result) {
      return;
    }

    setIcp(history.icp || '');
    setSendMode(history.sendMode || 'auto');
    setTargetCompany(history.targetCompany || '');
    setTestRecipientEmail(history.testRecipientEmail || '');
    setResult(history.result);
    setRankings(history.result?.rankings || []);
    hydrateTemplateAndRecipients(history.result);
    setSteps((currentSteps) => currentSteps.map((step) => ({
      ...step,
      status: 'completed',
      message: '',
    })));
  }, [hydrateTemplateAndRecipients]);

  const saveHistoryOnly = useCallback(async (workflowResult, inputs) => {
    if (!sessionToken) {
      return;
    }

    try {
      // Ensure result has required fields for display
      const enrichedForStorage = {
        ...workflowResult,
        // Ensure summary exists with company_count
        summary: {
          ...(workflowResult.summary || {}),
          company_count: workflowResult.summary?.company_count || 
                        (Array.isArray(workflowResult.companies) ? workflowResult.companies.length : 0),
        },
        // Ensure status is set
        status: workflowResult.status || 'completed',
        // Ensure selected_company_name is set (from rankings or companies)
        selected_company_name: workflowResult.selected_company_name || 
                              (Array.isArray(workflowResult.rankings) && workflowResult.rankings[0]?.company_name) ||
                              (Array.isArray(workflowResult.companies) && workflowResult.companies[0]?.company_name) || 
                              '',
      };

      await saveSearchHistory(sessionToken, {
        icp: inputs.icp,
        send_mode: inputs.send_mode,
        target_company: inputs.target_company,
        test_recipient_email: inputs.test_recipient_email,
        result: enrichedForStorage,
      });
    } catch {
      // Ignore history save failure to keep primary workflow responsive.
    }
  }, [sessionToken]);

  useEffect(() => {
    const historyId = searchParams.get('history');
    if (!sessionToken || !historyId) {
      return;
    }

    let active = true;
    const loadHistoryResult = async () => {
      setError('');
      try {
        const response = await getSearchHistoryItem(sessionToken, historyId);
        const history = response.history;
        if (!history?.result || !active) {
          return;
        }

        hydrateFromHistory(history);
        setSearchParams({});
      } catch (historyError) {
        console.error('History restore failed:', historyError);
        if (active) {
          setError(toUserSafeErrorMessage(historyError, 'Unable to restore history item.'));
        }
      }
    };

    loadHistoryResult();
    return () => {
      active = false;
    };
  }, [hydrateFromHistory, searchParams, sessionToken, setSearchParams]);

  const loadHistoryItems = useCallback(async () => {
    if (!sessionToken) {
      setHistoryItems([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await getSearchHistoryList(sessionToken, 40);
      setHistoryItems(response.history || []);
    } catch (loadError) {
      console.error('History load failed:', loadError);
      setHistoryError(loadError?.response?.data?.message || 'Unable to load history.');
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!historyPanelOpen) {
      return;
    }
    loadHistoryItems();
  }, [historyPanelOpen, loadHistoryItems]);

  const handleOpenHistoryItem = async (historyId) => {
    if (!sessionToken || !historyId) {
      return;
    }

    setHistoryDetailLoadingId(historyId);
    setHistoryMenuOpenFor('');
    try {
      const response = await getSearchHistoryItem(sessionToken, historyId);
      const history = response.history;
      if (!history?.result) {
        setHistoryError('Selected history has no result payload.');
        return;
      }
      setHistoryDetailItem(history);
    } catch (detailError) {
      console.error('History detail failed:', detailError);
      setHistoryError(detailError?.response?.data?.message || 'Unable to open history item.');
    } finally {
      setHistoryDetailLoadingId('');
    }
  };

  const handleRenameHistory = async (historyId) => {
    const nextIcp = String(historyRenameDraft || '').trim();
    if (!sessionToken || !historyId || !nextIcp) {
      return;
    }

    try {
      const response = await renameSearchHistoryItem(sessionToken, historyId, nextIcp);
      const updated = response.history;
      setHistoryItems((prev) => prev.map((item) => (
        item.id === historyId
          ? {
            ...item,
            icp: updated?.icp || nextIcp,
          }
          : item
      )));
      if (historyDetailItem?.id === historyId) {
        setHistoryDetailItem((prev) => ({
          ...(prev || {}),
          icp: updated?.icp || nextIcp,
        }));
      }
      setHistoryRenamingId('');
      setHistoryRenameDraft('');
      setHistoryMenuOpenFor('');
    } catch (renameError) {
      console.error('History rename failed:', renameError);
      setHistoryError(renameError?.response?.data?.message || 'Unable to rename history item.');
    }
  };

  const handleDeleteHistory = async (historyId) => {
    if (!sessionToken || !historyId) {
      return;
    }

    try {
      await deleteSearchHistoryItem(sessionToken, historyId);
      setHistoryItems((prev) => prev.filter((item) => item.id !== historyId));
      if (historyDetailItem?.id === historyId) {
        setHistoryDetailItem(null);
      }
      setHistoryMenuOpenFor('');
      if (searchParams.get('history') === historyId) {
        setSearchParams({});
      }
    } catch (deleteError) {
      console.error('History delete failed:', deleteError);
      setHistoryError(deleteError?.response?.data?.message || 'Unable to delete history item.');
    }
  };

  const closeHistoryDetail = () => {
    setHistoryDetailItem(null);
  };

  const openHistoryInWorkspace = () => {
    if (!historyDetailItem?.result) {
      return;
    }
    hydrateFromHistory(historyDetailItem);
    setHistoryPanelOpen(false);
    setHistoryDetailItem(null);
  };

  const handleStreamEvent = useCallback((event) => {
    if (event.type === 'step') {
      updateStep(event.step, event.status, event.message || '');

      const stepData = event.data || {};
      if (event.step === 'step1' && event.status === 'completed' && Array.isArray(stepData.companies)) {
        setLiveCompanies(stepData.companies);
      }

      if (event.step === 'step5' && event.status === 'completed' && Array.isArray(stepData.rankings)) {
        setLiveRankings(stepData.rankings);
        setLiveSelectedCompanyName(stepData.selected_company_name || '');
      }

      if (event.step === 'step6' && event.status === 'completed') {
        setLiveContacts(Array.isArray(stepData.contacts) ? stepData.contacts : []);
        setLiveSuggestedContact(stepData.suggested_contact || {});
        setLiveRecipientOverride(stepData.test_recipient_override || '');
        if (stepData.selected_company?.company_name) {
          setLiveSelectedCompanyName(stepData.selected_company.company_name);
        }
      }

      if (event.step === 'step7' && (event.status === 'completed' || event.status === 'failed')) {
        setLiveOutreachPreview(stepData.outreach || null);
      }
      return;
    }

    if (event.type === 'result') {
      const resultData = event.data;
      setResult(resultData);
      setRankings(resultData?.rankings || []);
      hydrateTemplateAndRecipients(resultData);

      // Enhance result with step-by-step workflow content
      const enrichedResult = {
        ...resultData,
        workflow_steps: steps.map(step => ({
          id: step.id,
          label: step.label,
          status: step.status,
          message: step.message,
        })),
        step_timestamp: new Date().toISOString(),
      };

      saveHistoryOnly(enrichedResult, {
        icp,
        send_mode: sendMode,
        target_company: targetCompany,
        test_recipient_email: testRecipientEmail,
      });
      return;
    }

    if (event.type === 'error') {
      const safeMessage = toUserSafeErrorMessage({ message: event.message }, 'The agent failed before completing the workflow.');
      console.error('Workflow stream error event:', event.message);
      setError(safeMessage);
      markRunningStepFailed(safeMessage);
    }
  }, [icp, sendMode, targetCompany, testRecipientEmail, steps, saveHistoryOnly]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!sessionToken) {
      setError('Please login again to continue.');
      return;
    }

    const senderProfile = getSenderProfile(session?.user || {});
    if (!isProfileComplete(senderProfile, session?.user || {})) {
      markProfileCompletionRequired(true);
      setError('Please complete your profile first (Name, Phone Number, Email ID).');
      window.location.assign('/profile?onboarding=1');
      return;
    }

    try {
      const usage = await consumeCredits(sessionToken, 5, 'ICP_RUN');
      setCreditsInfo({
        plan: String(usage.plan || creditsInfo.plan || 'FREE').toUpperCase(),
        creditsRemaining: Number(usage.creditsRemaining || 0),
        monthlyCredits: Number(usage.monthlyCredits || 0),
        nextResetAt: usage.nextResetAt || creditsInfo.nextResetAt || null,
      });

      const latestSession = getStoredSession();
      if (latestSession?.token) {
        const updatedSession = {
          ...latestSession,
          user: {
            ...(latestSession.user || {}),
            plan: String(usage.plan || latestSession?.user?.plan || 'FREE').toUpperCase(),
            creditsRemaining: Number(usage.creditsRemaining || 0),
            monthlyCredits: Number(usage.monthlyCredits || 0),
            nextResetAt: usage.nextResetAt || null,
            plus: ['PRO', 'ENTERPRISE'].includes(String(usage.plan || '').toUpperCase()),
          },
        };
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
        window.localStorage.setItem('firereach_user', JSON.stringify(updatedSession.user));
        window.dispatchEvent(new Event('firereach-session-updated'));
      }
    } catch (creditError) {
      console.error('Credits consume failed:', creditError);
      if (creditError?.response?.status === 401) {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        window.localStorage.removeItem('firereach_user');
        window.dispatchEvent(new Event('firereach-session-updated'));
        setError('Session expired. Please login again.');
        return;
      }
      if (creditError?.response?.status === 402) {
        setCreditsModalOpen(true);
        setError('');
        return;
      }
      setError(toUserSafeErrorMessage(creditError, 'Unable to start workflow right now.'));
      return;
    }

    setLoading(true);
    setResult(null);
    setRankings([]);
    setLiveCompanies([]);
    setLiveRankings([]);
    setLiveSelectedCompanyName('');
    setLiveContacts([]);
    setLiveSuggestedContact({});
    setLiveOutreachPreview(null);
    setLiveRecipientOverride('');
    setCopiedEmailKey('');
    setManualSendingMap({});
    setSelectingCompanyMap({});
    setSelectedRecipientMap({});
    setBaseTemplateMap({});
    setEditingTemplateMap({});
    setTemplateDrafts({});
    setSteps(createInitialSteps());

    try {
      await runAgentStream({
        icp,
        send_mode: sendMode,
        target_company: targetCompany,
        test_recipient_email: testRecipientEmail,
        sender_profile: senderProfile,
      }, handleStreamEvent);
    } catch (streamError) {
      console.error(streamError);
      const safe = toUserSafeErrorMessage(streamError, 'An error occurred while running the agent.');
      setError(safe);
      markRunningStepFailed(safe);
    } finally {
      setLoading(false);
    }
  };

  const updateGreetingWithRecipient = (body, recipientName) => {
    const currentBody = extractBodyFromJsonLike(body);
    const safeName = String(recipientName || '').trim() || 'there';
    const greetingLine = `Hello ${safeName},`;
    const salutationRegex = /^\s*(hello|hi|dear)\s+[^,]+,\s*$/i;
    const lines = currentBody.split('\n');

    let cursor = 0;
    while (cursor < lines.length) {
      const trimmed = lines[cursor].trim();
      if (!trimmed) {
        cursor += 1;
        continue;
      }

      if (salutationRegex.test(trimmed) || isStandaloneNameLine(trimmed)) {
        cursor += 1;
        continue;
      }

      break;
    }

    const normalizedBody = lines.slice(cursor).join('\n').trim();

    return `${greetingLine}\n\n${normalizedBody}`.trim();
  };

  const buildRecipientAwareTemplate = useCallback((company, baseTemplate, selectedContactEmail = '') => {
    const selectedContact = (company.contacts || []).find((contact) => contact.email === selectedContactEmail);
    const testRecipientOverride = String(testRecipientEmail || '').trim();
    const senderProfile = getSenderProfile(session?.user || {});

    if (!selectedContactEmail && !testRecipientOverride) {
      return {
        subject: baseTemplate.subject,
        email_content: applySenderSignature(baseTemplate.email_content, senderProfile),
      };
    }

    return {
      subject: baseTemplate.subject,
      email_content: applySenderSignature(replaceDesignationForRecipient(
        updateGreetingWithRecipient(
          baseTemplate.email_content,
          resolveRecipientName(selectedContact?.person_name, testRecipientOverride),
        ),
        company?.suggested_contact?.role,
        selectedContact?.role,
      ), senderProfile),
    };
  }, [session?.user, testRecipientEmail]);

  const getResolvedTemplateForCompany = useCallback((company) => {
    const companyKey = company.company_name;
    if (editingTemplateMap[companyKey] && templateDrafts[companyKey]) {
      return templateDrafts[companyKey];
    }

    const baseTemplate = baseTemplateMap[companyKey] || {
      subject: company.outreach?.subject || '',
      email_content: extractBodyFromJsonLike(company.outreach?.email_content || ''),
    };
    const selectedRecipient = selectedRecipientMap[companyKey] || '';
    return buildRecipientAwareTemplate(company, baseTemplate, selectedRecipient);
  }, [baseTemplateMap, buildRecipientAwareTemplate, editingTemplateMap, selectedRecipientMap, templateDrafts]);

  const replaceDesignationForRecipient = (body, previousRole, nextRole) => {
    const currentBody = extractBodyFromJsonLike(body);
    const fromRole = String(previousRole || '').trim();
    const toRole = String(nextRole || '').trim();

    if (!fromRole || !toRole || fromRole.toLowerCase() === toRole.toLowerCase()) {
      return currentBody;
    }

    const escapedFromRole = fromRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const roleRegex = new RegExp(escapedFromRole, 'gi');

    if (!roleRegex.test(currentBody)) {
      return currentBody;
    }

    return currentBody.replace(roleRegex, toRole);
  };

  const handleSelectCompany = async (company) => {
    const companyName = company.company_name;
    setError('');
    setSelectingCompanyMap((prev) => ({ ...prev, [companyName]: true }));
    updateStep('step6', 'in-progress', `Finding contacts for ${companyName}...`);

    try {
      const response = await selectCompany({
        icp,
        send_mode: 'manual',
        sender_profile: getSenderProfile(session?.user || {}),
        selected_company: {
          company_name: company.company_name,
          industry: company.industry,
          website: company.website,
          domain: company.domain,
          verified_signals: company.verified_signals,
          account_brief: company.account_brief,
          reason: company.reason,
        },
      });

      const selectedCompany = response?.selected_company || {};

      setResult((prevResult) => {
        if (!prevResult) {
          return prevResult;
        }

        const updatedCompanies = (prevResult.companies || []).map((item) => (
          item.company_name === companyName
            ? {
              ...item,
              ...selectedCompany,
            }
            : item
        ));

        return {
          ...prevResult,
          status: 'manual_ready',
          selected_company_name: companyName,
          companies: updatedCompanies,
          summary: {
            ...prevResult.summary,
            emails_pending_manual: 1,
          },
        };
      });

      setRankings((prev) => prev.map((item) => ({
        ...item,
        selected: item.company_name === companyName,
      })));

      setBaseTemplateMap((prev) => ({
        ...prev,
        [companyName]: {
          subject: selectedCompany?.outreach?.subject || '',
          email_content: extractBodyFromJsonLike(selectedCompany?.outreach?.email_content || ''),
        },
      }));

      setSelectedRecipientMap((prev) => ({
        ...prev,
        [companyName]: '',
      }));

      const nextBaseTemplate = {
        subject: selectedCompany?.outreach?.subject || '',
        email_content: extractBodyFromJsonLike(selectedCompany?.outreach?.email_content || ''),
      };

      setTemplateDrafts((prev) => ({
        ...prev,
        [companyName]: buildRecipientAwareTemplate(selectedCompany, nextBaseTemplate, ''),
      }));

      updateStep('step6', 'completed', `Found contacts for ${companyName}.`);
      updateStep('step7', 'completed', 'Email generated. Select recipient and click Send Email.');
    } catch (selectError) {
      console.error(selectError);
      const safeMessage = toUserSafeErrorMessage(selectError, 'Failed to select company.');
      updateStep('step6', 'failed', safeMessage);
      setError(safeMessage);
    } finally {
      setSelectingCompanyMap((prev) => ({ ...prev, [companyName]: false }));
    }
  };

  const handleCopyEmail = async (company) => {
    const resolved = getResolvedTemplateForCompany(company);
    const subject = resolved?.subject ?? company.outreach?.subject ?? '';
    const body = extractBodyFromJsonLike(resolved?.email_content ?? company.outreach?.email_content ?? '');
    const preview = `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(preview);
    setCopiedEmailKey(company.company_name);
    window.setTimeout(() => setCopiedEmailKey(''), 1600);
  };

  const handleToggleRecipient = (company, contact) => {
    const companyName = company.company_name;
    const contactEmail = contact.email;
    const currentSelected = selectedRecipientMap[companyName] || '';
    const nextSelected = currentSelected === contactEmail ? '' : contactEmail;

    setSelectedRecipientMap((prev) => ({
      ...prev,
      [companyName]: nextSelected,
    }));

    if (editingTemplateMap[companyName]) {
      const baseTemplate = baseTemplateMap[companyName] || {
        subject: company.outreach?.subject || '',
        email_content: extractBodyFromJsonLike(company.outreach?.email_content || ''),
      };
      setTemplateDrafts((prev) => ({
        ...prev,
        [companyName]: buildRecipientAwareTemplate(company, baseTemplate, nextSelected),
      }));
    }
  };

  const startTemplateEdit = (company) => {
    const companyKey = company.company_name;
    const existingDraft = getResolvedTemplateForCompany(company);
    setTemplateDrafts((prev) => ({
      ...prev,
      [companyKey]: {
        subject: existingDraft?.subject ?? '',
        email_content: extractBodyFromJsonLike(existingDraft?.email_content ?? ''),
      },
    }));
    setEditingTemplateMap((prev) => ({ ...prev, [companyKey]: true }));
  };

  const cancelTemplateEdit = (companyKey) => {
    setEditingTemplateMap((prev) => ({ ...prev, [companyKey]: false }));
    setTemplateDrafts((prev) => {
      const next = { ...prev };
      delete next[companyKey];
      return next;
    });
  };

  const updateTemplateDraft = (companyKey, field, value) => {
    setTemplateDrafts((prev) => ({
      ...prev,
      [companyKey]: {
        ...(prev[companyKey] || {}),
        [field]: value,
      },
    }));
  };

  const saveTemplateEdit = (companyKey) => {
    const draft = templateDrafts[companyKey];
    if (!draft) {
      return;
    }

    setResult((prevResult) => {
      if (!prevResult) {
        return prevResult;
      }

      return {
        ...prevResult,
        companies: (prevResult.companies || []).map((item) => (
          item.company_name === companyKey
            ? {
              ...item,
              outreach: {
                ...item.outreach,
                subject: draft.subject,
                email_content: draft.email_content,
              },
            }
            : item
        )),
      };
    });

    setBaseTemplateMap((prev) => ({
      ...prev,
      [companyKey]: {
        subject: draft.subject,
        email_content: draft.email_content,
      },
    }));

    setEditingTemplateMap((prev) => ({ ...prev, [companyKey]: false }));
    setTemplateDrafts((prev) => {
      const next = { ...prev };
      delete next[companyKey];
      return next;
    });
  };

  const selectBestPdfForRole = (role, icpText = '') => {
    const roleText = String(role || '').toLowerCase();
    const merged = `${roleText} ${String(icpText || '').toLowerCase()}`.trim();

    // Check specific roles first before general ones to avoid overlaps
    const roleMapping = [
      { keywords: ['cto', 'chief technology officer', 'vp engineering', 'head engineer', 'tech lead', 'engineering lead', 'principal engineer'], filename: 'pitch_cto.pdf' },
      { keywords: ['cpo', 'chief product officer', 'vp product', 'head of product', 'product manager', 'pm', 'product owner', 'product lead'], filename: 'pitch_product.pdf' },
      { keywords: ['hr director', 'head of hr', 'chief people', 'talent director', 'people operations', 'recruitment director', 'hr manager'], filename: 'pitch_hr.pdf' },
      { keywords: ['cfo', 'chief financial officer', 'vp finance', 'finance director', 'controller', 'accounting', 'treasurer', 'investor relations'], filename: 'pitch_investor.pdf' },
      { keywords: ['ceo', 'chief executive officer', 'founder', 'co-founder', 'president'], filename: 'pitch_founder.pdf' },
    ];

    for (const item of roleMapping) {
      if (item.keywords.some((keyword) => merged.includes(keyword))) {
        return item.filename;
      }
    }

    return 'pitch_general.pdf';
  };

  const openPdfPreview = (pdfFilename, designation) => {
    const cleanFilename = String(pdfFilename || '').trim();
    if (!cleanFilename) {
      return;
    }

    setPdfPreviewModal({
      filename: cleanFilename,
      designation: String(designation || '').trim() || 'Professional Contact',
      url: `${PDF_BASE_URL}/pitches/${encodeURIComponent(cleanFilename)}`,
      downloadUrl: `${PDF_BASE_URL}/pitches/${encodeURIComponent(cleanFilename)}?download=1`,
    });
  };

  const closePdfPreview = () => {
    setPdfPreviewModal(null);
  };

  const handleManualSend = async (companyName) => {
    const company = (result?.companies || []).find((item) => item.company_name === companyName);
    const draft = company ? getResolvedTemplateForCompany(company) : null;
    const finalSubject = draft?.subject ?? company?.outreach?.subject;
    const finalContent = extractBodyFromJsonLike(draft?.email_content ?? company?.outreach?.email_content);
    const selectedRecipient = selectedRecipientMap[companyName] || '';
    const chosenContact = (company?.contacts || []).find((contact) => contact.email === selectedRecipient);
    const testRecipientOverride = String(testRecipientEmail || '').trim();
    const testRecipientName = firstNameFromEmail(testRecipientOverride);
    const finalRecipient = testRecipientOverride || chosenContact?.email || '';
    const finalEmailContent = testRecipientName
      ? updateGreetingWithRecipient(finalContent, testRecipientName)
      : finalContent;
    const senderProfile = getSenderProfile(session?.user || {});
    const signedEmailContent = applySenderSignature(finalEmailContent, senderProfile);
    const roleForPdf = chosenContact?.role || company?.suggested_contact?.role || '';
    const finalPdfFilename = selectBestPdfForRole(roleForPdf, icp);

    if (!finalRecipient || !finalSubject || !signedEmailContent) {
      setError(testRecipientOverride
        ? 'Email subject/content is missing for manual send.'
        : 'Please select one recipient contact before sending.');
      return;
    }

    setManualSendingMap((prev) => ({ ...prev, [companyName]: true }));
    try {
      const sendResult = await sendGeneratedEmail({
        recipient: finalRecipient,
        subject: finalSubject,
        email_content: signedEmailContent,
        pdf_filename: finalPdfFilename,
      });

      setResult((prevResult) => {
        if (!prevResult) {
          return prevResult;
        }

        const updatedCompanies = (prevResult.companies || []).map((item) => {
          if (item.company_name !== companyName) {
            return item;
          }

          return {
            ...item,
            outreach: {
              ...item.outreach,
              ...sendResult,
              recipient: finalRecipient,
              pdf_filename: finalPdfFilename,
            },
          };
        });

        const sentCount = updatedCompanies.filter((item) => item.outreach?.status === 'sent').length;

        return {
          ...prevResult,
          companies: updatedCompanies,
          status: sentCount > 0 ? 'completed' : prevResult.status,
          summary: {
            ...prevResult.summary,
            emails_sent: sentCount,
            emails_failed: Math.max(1 - sentCount, 0),
            emails_pending_manual: 0,
          },
        };
      });
    } catch (sendError) {
      console.error(sendError);
      setError(toUserSafeErrorMessage(sendError, 'Failed to send email manually.'));
    } finally {
      setManualSendingMap((prev) => ({ ...prev, [companyName]: false }));
    }
  };

  const displayedCompanies = (() => {
    if (!result) return [];
    if (result.send_mode !== 'manual') return result.companies || [];
    if (!result.selected_company_name) return [];
    return (result.companies || []).filter((company) => company.company_name === result.selected_company_name);
  })();

  const isWorkflowFailureStatus = ['failed', 'error', 'partial'].includes(String(result?.status || '').toLowerCase());
  const historyResult = historyDetailItem?.result || null;
  const historyTopRankings = Array.isArray(historyResult?.rankings) ? historyResult.rankings.slice(0, 5) : [];
  const historyCompanies = Array.isArray(historyResult?.companies) ? historyResult.companies : [];
  const historySelectedCompany = historyCompanies.find((item) => item.company_name === historyResult?.selected_company_name);
  const historySnapshots = historyCompanies.map((company) => {
    const ranked = historyTopRankings.find((item) => item.company_name === company.company_name);
    const resolvedOutreach = deriveHistoryOutreach(company, historyResult);
    return {
      ...company,
      ranked,
      resolvedOutreach,
    };
  });

  return (
    <div className="dashboard-container firereach-shell">
      <header className="header app-header">
        <div className="app-header-copy">
          <h1>FireReach</h1>
          <p>Autonomous AI-powered outreach intelligence console</p>
        </div>
        <div className="app-header-actions">
          {sessionToken && (
            <div className="app-credits-pill">
              <span>{creditsInfo.plan === 'PRO' ? 'Popular+' : creditsInfo.plan === 'ENTERPRISE' ? 'Custom+' : 'Free'}</span>
              <strong>{creditsInfo.creditsRemaining}/{creditsInfo.monthlyCredits || 0}</strong>
            </div>
          )}
          <button
            type="button"
            className="app-history-toggle"
            onClick={() => setHistoryPanelOpen(true)}
          >
            <History size={16} />
            History
          </button>
        </div>
      </header>

      <div className="firereach-layout">
        <aside className="command-rail">
        <section className="glass-panel command-panel input-panel">
          <div className="panel-eyebrow">
            <Sparkles size={14} />
            FireReach Agent Console
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>
                <Cpu size={16} className="label-icon" />
                Ideal Customer Profile (ICP)
              </label>
              <textarea
                className="input-field command-textarea"
                name="icp"
                rows="5"
                value={icp}
                onChange={(event) => setIcp(event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Target Company (Optional)</label>
              <input
                className="input-field"
                type="text"
                value={targetCompany}
                onChange={(event) => setTargetCompany(event.target.value)}
                placeholder="e.g. Stripe, Notion, HubSpot"
              />
              <p className="mode-helper-text">
                Add a specific company to skip discovery and reduce token usage.
              </p>
            </div>

            <div className="form-group">
              <label>Test Recipient Email (Optional)</label>
              <input
                className="input-field"
                type="email"
                value={testRecipientEmail}
                onChange={(event) => setTestRecipientEmail(event.target.value)}
                placeholder="e.g. yourname@gmail.com"
              />
              <p className="mode-helper-text">
                Testing only: in auto mode, final send is forced to this email when provided.
              </p>
            </div>

            <div className="form-group">
              <label>Mail Delivery Mode</label>
              <div className="mode-toggle" role="radiogroup" aria-label="Mail delivery mode">
                <button
                  type="button"
                  className={`mode-option ${sendMode === 'auto' ? 'active' : ''}`}
                  onClick={() => setSendMode('auto')}
                >
                  Auto Send
                </button>
                <button
                  type="button"
                  className={`mode-option ${sendMode === 'manual' ? 'active' : ''}`}
                  onClick={() => setSendMode('manual')}
                >
                  Manual Send
                </button>
              </div>
              <p className="mode-helper-text">
                {sendMode === 'auto'
                  ? 'Auto mode sends email immediately after generation.'
                  : 'Manual mode pauses after ranking and waits for your company + recipient selection.'}
              </p>
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? (
                <>
                  <LoaderCircle className="spin-animation" size={20} />
                  Agent Operating...
                </>
              ) : (
                <>
                  <Send size={20} />
                  Deploy Agent
                </>
              )}
            </button>
          </form>
        </section>
        </aside>

        <main className="workspace-main">
        <section className="glass-panel progress-shell">
          {/* Header row */}
          <div className="fr-header">
            <div className="fr-active-label">
              <div className={`fr-live-dot ${steps.every(s => s.status === 'completed') ? 'done' : ''}`} />
              <span>{activeStep?.label || 'Initializing agent...'}</span>
            </div>
            <span className="fr-pct">{progressPercent}%</span>
          </div>

          {/* Progress bar */}
          <div className="fr-track">
            <div
              className={`fr-fill ${progressPercent === 100 ? 'all-done' : ''}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Step nodes row */}
          <div className="fr-steps-row">
            {steps.map((step, index) => (
              <div key={step.id} className={`fr-step ${step.status}`}>
                <div className="fr-node">
                  {step.status === 'in-progress' && (
                    <div className="fr-spinner" />
                  )}
                  {step.status === 'completed' && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5"
                        stroke="white" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {step.status === 'failed' && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M3 3l6 6M9 3l-6 6"
                        stroke="#ef4444" strokeWidth="1.8"
                        strokeLinecap="round"/>
                    </svg>
                  )}
                  {(step.status === 'pending') && (
                    <span className="fr-num">{index + 1}</span>
                  )}
                </div>
                <div className="fr-step-label">
                  {step.label.replace('Step ', '').replace(/\d+:\s*/, '').replace('...', '')}
                </div>
              </div>
            ))}
          </div>

          {/* Active step message */}
          {activeStep?.message && (
            <div className="fr-step-msg">{activeStep.message}</div>
          )}

          {error && (
            <div className="error-banner" style={{ marginTop: '1rem' }}>{error}</div>
          )}
        </section>

        <section className="glass-panel results-panel">
          <div className="results-header">
            <div>
              <div className="panel-eyebrow">
                <Building2 size={14} />
                Deployment Results
              </div>
              <h2>Company Outreach Queue</h2>
            </div>
            {result && (
              <div className={`status-pill ${isWorkflowFailureStatus ? 'status-failed' : ''}`}>
                Status: {String(result.status || '').toUpperCase()}
              </div>
            )}
          </div>

          {!result && !loading && (
            <div className="empty-state">
              <Mail size={36} />
              <h3>Waiting for deployment</h3>
              <p>Submit an ICP and FireReach will discover companies, score them, and run outreach flow.</p>
            </div>
          )}

          {loading && sendMode === 'auto' && (liveCompanies.length > 0 || liveRankings.length > 0 || liveContacts.length > 0 || liveOutreachPreview) && (
            <>
              {liveCompanies.length > 0 && (
                <div className="section-block" style={{ marginBottom: 16 }}>
                  <div className="section-title">Step 1 Output: Companies Found</div>
                  <div className="company-grid">
                    {liveCompanies.map((company) => (
                      <article key={`live-company-${company.company_name}`} className="company-card">
                        <div className="company-card-header">
                          <div className="company-identity">
                            <div className="company-logo-wrap">
                              {resolveCompanyVisualUrl(company) ? (
                                <img
                                  src={resolveCompanyVisualUrl(company)}
                                  alt={`${company.company_name} logo`}
                                  className="company-logo"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                    const fallback = event.currentTarget.parentElement?.querySelector('.company-logo-fallback');
                                    if (fallback) fallback.style.display = 'inline-flex';
                                  }}
                                />
                              ) : null}
                              <span
                                className="company-logo-fallback"
                                style={{ display: resolveCompanyVisualUrl(company) ? 'none' : 'inline-flex' }}
                              >
                                {companyInitials(company.company_name)}
                              </span>
                            </div>
                            <div>
                            <h3>{company.company_name}</h3>
                            <p>{company.industry}</p>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {liveRankings.length > 0 && (
                <div className="section-block" style={{ marginBottom: 16 }}>
                  <div className="section-title">Step 5 Output: Company Ranking</div>
                  <div className="company-grid">
                    {liveRankings.map((ranked) => (
                      <article
                        key={`live-rank-${ranked.company_name}`}
                        className="company-card"
                        style={{ border: ranked.rank === 1 ? '1px solid #ff8a3d' : undefined }}
                      >
                        <div className="company-card-header">
                          <div className="company-identity">
                            <div className="company-logo-wrap">
                              {resolveCompanyVisualUrl(ranked) ? (
                                <img
                                  src={resolveCompanyVisualUrl(ranked)}
                                  alt={`${ranked.company_name} logo`}
                                  className="company-logo"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                    const fallback = event.currentTarget.parentElement?.querySelector('.company-logo-fallback');
                                    if (fallback) fallback.style.display = 'inline-flex';
                                  }}
                                />
                              ) : null}
                              <span
                                className="company-logo-fallback"
                                style={{ display: resolveCompanyVisualUrl(ranked) ? 'none' : 'inline-flex' }}
                              >
                                {companyInitials(ranked.company_name)}
                              </span>
                            </div>
                            <div>
                              <h3>#{ranked.rank} {ranked.company_name}</h3>
                              <div className="ranking-metrics">
                                <span>Signal {ranked.signal_score}</span>
                                <span>ICP {ranked.icp_score}</span>
                                <span>Final {ranked.final_score}</span>
                              </div>
                            </div>
                          </div>
                          {ranked.rank === 1 && <span className="selected-contact-tag">Agent Selected</span>}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {liveContacts.length > 0 && (
                <div className="section-block" style={{ marginBottom: 16 }}>
                  <div className="section-title">
                    Step 6 Output: Contacts Found{liveSelectedCompanyName ? ` for ${liveSelectedCompanyName}` : ''}
                  </div>
                  {liveRecipientOverride && (
                    <p className="mode-helper-text">Testing override active: final send will go to {liveRecipientOverride}</p>
                  )}
                  <div className="contact-list">
                    {liveContacts.map((contact) => {
                      const isSuggested = liveSuggestedContact?.email && liveSuggestedContact.email === contact.email;
                      return (
                        <div
                          key={`live-contact-${contact.email}`}
                          className="contact-card"
                          style={{ border: isSuggested ? '1px solid #ffb84d' : undefined }}
                        >
                          <div className="contact-topline contact-topline-with-avatar">
                            <div className="contact-person-block">
                              <div className="contact-avatar-wrap">
                                {resolveContactAvatar(contact) ? (
                                  <img
                                    src={resolveContactAvatar(contact)}
                                    alt={`${contact.person_name || contact.email} avatar`}
                                    className="contact-avatar"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(event) => {
                                      event.currentTarget.style.display = 'none';
                                      const fallback = event.currentTarget.parentElement?.querySelector('.contact-avatar-fallback');
                                      if (fallback) fallback.style.display = 'inline-flex';
                                    }}
                                  />
                                ) : null}
                                <span
                                  className="contact-avatar-fallback"
                                  style={{ display: resolveContactAvatar(contact) ? 'none' : 'inline-flex' }}
                                >
                                  {contactInitials(contact.person_name, contact.email)}
                                </span>
                              </div>
                              <strong>{contact.person_name}</strong>
                            </div>
                            <span className={`confidence-badge confidence-${confidenceTone(contact.confidence)}`}>
                              {confidenceLabel(contact.confidence)}
                            </span>
                          </div>
                          <div className="contact-role">{contact.role}</div>
                          <div className="contact-email">{contact.email}</div>
                          {isSuggested && <div className="selected-contact-tag">Agent Selected - Best ICP Match</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {liveOutreachPreview && (
                <div className="section-block" style={{ marginBottom: 16 }}>
                  <div className="section-title">Step 7 Output: Email Generated</div>
                  <div className="email-preview-box">
                    <div className="email-subject">Subject: {liveOutreachPreview.subject}</div>
                    <pre>{extractBodyFromJsonLike(liveOutreachPreview.email_content)}</pre>
                    {liveOutreachPreview.pdf_filename && (
                      <div className="selected-contact-tag" style={{ marginTop: 8 }}>
                        Attachment: {liveOutreachPreview.pdf_filename}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {result && (
            <>
              <div className="summary-strip">
                <div>
                  <strong>{result.summary?.company_count || 0}</strong>
                  <span>Companies</span>
                </div>
                <div>
                  <strong>{result.summary?.emails_sent || 0}</strong>
                  <span>Sent</span>
                </div>
                <div>
                  <strong>{result.summary?.emails_failed || 0}</strong>
                  <span>Failed</span>
                </div>
                <div>
                  <strong>{result.summary?.emails_pending_manual || 0}</strong>
                  <span>Pending Manual</span>
                </div>
              </div>

              {rankings.length > 0 && (
                <div className="section-block" style={{ marginBottom: 16 }}>
                  <div className="section-title">Company Rankings</div>
                  <div className="company-grid">
                    {rankings.map((ranked) => {
                      const isRecommended = ranked.rank === 1;
                      const isSelected = result?.selected_company_name === ranked.company_name || ranked.selected;

                      return (
                        <article
                          key={`rank-${ranked.company_name}`}
                          className="company-card"
                          style={{
                            border: isSelected ? '1px solid #ff8a3d' : undefined,
                          }}
                        >
                          <div className="company-card-header">
                            <div className="company-identity">
                              <div className="company-logo-wrap">
                                {resolveCompanyVisualUrl(ranked) ? (
                                  <img
                                    src={resolveCompanyVisualUrl(ranked)}
                                    alt={`${ranked.company_name} logo`}
                                    className="company-logo"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(event) => {
                                      event.currentTarget.style.display = 'none';
                                      const fallback = event.currentTarget.parentElement?.querySelector('.company-logo-fallback');
                                      if (fallback) fallback.style.display = 'inline-flex';
                                    }}
                                  />
                                ) : null}
                                <span
                                  className="company-logo-fallback"
                                  style={{ display: resolveCompanyVisualUrl(ranked) ? 'none' : 'inline-flex' }}
                                >
                                  {companyInitials(ranked.company_name)}
                                </span>
                              </div>
                              <div>
                                <h3>#{ranked.rank} {ranked.company_name}</h3>
                                <div className="ranking-metrics">
                                  <span>Signal {ranked.signal_score}</span>
                                  <span>ICP {ranked.icp_score}</span>
                                  <span>Final {ranked.final_score}</span>
                                </div>
                              </div>
                            </div>
                            {sendMode === 'auto' && isRecommended && (
                              <span className="selected-contact-tag">Agent Selected</span>
                            )}
                            {sendMode === 'manual' && isRecommended && (
                              <span className="selected-contact-tag">Recommended</span>
                            )}
                          </div>

                          {!!ranked.score_reason && <p className="company-reason">{ranked.score_reason}</p>}

                          {sendMode === 'manual' && (
                            <button
                              type="button"
                              className="copy-button send-manual-button"
                              onClick={() => handleSelectCompany((result.companies || []).find((item) => item.company_name === ranked.company_name) || ranked)}
                              disabled={!!selectingCompanyMap[ranked.company_name]}
                            >
                              {selectingCompanyMap[ranked.company_name]
                                ? 'Selecting...'
                                : isSelected
                                  ? 'Selected Company'
                                  : 'Select This Company'}
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              {result.send_mode === 'manual' && !result.selected_company_name && (
                <div className="empty-state" style={{ marginTop: 12 }}>
                  <h3>Manual mode paused</h3>
                  <p>Select one ranked company to continue to Email Finder and Outreach generation.</p>
                </div>
              )}

              <div className={`company-grid ${displayedCompanies.length === 1 ? 'company-grid-single' : ''}`}>
                {displayedCompanies.map((company) => (
                  (() => {
                    const selectedEmail = selectedRecipientMap[company.company_name] || '';
                    const selectedContact = (company.contacts || []).find((contact) => contact.email === selectedEmail);
                    const activeDesignation = selectedContact?.role || company?.suggested_contact?.role || 'Professional Contact';
                    const roleMatchedPdf = selectBestPdfForRole(activeDesignation, icp);
                    const effectivePdfFilename = roleMatchedPdf || company?.outreach?.pdf_filename || 'pitch_general.pdf';

                    return (
                  <article key={company.company_name} className="company-card">
                    <div className="company-card-header">
                      <div className="company-identity">
                        <div className="company-logo-wrap">
                          {resolveCompanyVisualUrl(company) ? (
                            <img
                              src={resolveCompanyVisualUrl(company)}
                              alt={`${company.company_name} logo`}
                              className="company-logo"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                                const fallback = event.currentTarget.parentElement?.querySelector('.company-logo-fallback');
                                if (fallback) fallback.style.display = 'inline-flex';
                              }}
                            />
                          ) : null}
                          <span
                            className="company-logo-fallback"
                            style={{ display: resolveCompanyVisualUrl(company) ? 'none' : 'inline-flex' }}
                          >
                            {companyInitials(company.company_name)}
                          </span>
                        </div>
                        <div>
                        <h3>{company.company_name}</h3>
                        <p>{company.industry}</p>
                        </div>
                      </div>
                      <a href={company.website} target="_blank" rel="noreferrer" className="company-link">
                        Visit Site
                      </a>
                    </div>

                    <p className="company-reason">{company.reason}</p>

                    <div className="section-block">
                      <div className="section-title">Top Signals</div>
                      <div className="badge-row">
                        {(company.signal_categories || []).map((signalCode) => (
                          <span key={signalCode} className="signal-badge">{signalCode}</span>
                        ))}
                      </div>
                      <div className="signal-list">
                        {Object.entries(company.verified_signals || {}).map(([signalCode, signal]) => (
                          <div key={signalCode} className="signal-item">
                            <div className="signal-meta">
                              <span className="signal-badge">{signalCode}</span>
                              {signal.source && (
                                <a href={signal.source} target="_blank" rel="noreferrer" className="source-link">
                                  Source
                                </a>
                              )}
                            </div>
                            <p>{signal.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="section-block">
                      <div className="section-title">Account Brief</div>
                      <div className="brief-box">{company.account_brief}</div>
                    </div>

                    <div className="section-block">
                      <div className="section-title">Email Contacts</div>
                      <div className="contact-list">
                        {(company.contacts || []).map((contact) => (
                          <div
                            key={`${company.company_name}-${contact.email}`}
                            className={`contact-card ${selectedRecipientMap[company.company_name] === contact.email ? 'contact-selected' : ''}`}
                          >
                            <div className="contact-topline contact-topline-with-avatar">
                              <div className="contact-person-block">
                                <div className="contact-avatar-wrap">
                                  {resolveContactAvatar(contact) ? (
                                    <img
                                      src={resolveContactAvatar(contact)}
                                      alt={`${contact.person_name || contact.email} avatar`}
                                      className="contact-avatar"
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      onError={(event) => {
                                        event.currentTarget.style.display = 'none';
                                        const fallback = event.currentTarget.parentElement?.querySelector('.contact-avatar-fallback');
                                        if (fallback) fallback.style.display = 'inline-flex';
                                      }}
                                    />
                                  ) : null}
                                  <span
                                    className="contact-avatar-fallback"
                                    style={{ display: resolveContactAvatar(contact) ? 'none' : 'inline-flex' }}
                                  >
                                    {contactInitials(contact.person_name, contact.email)}
                                  </span>
                                </div>
                                <strong>{contact.person_name}</strong>
                              </div>
                              <span className={`confidence-badge confidence-${confidenceTone(contact.confidence)}`}>
                                {confidenceLabel(contact.confidence)}
                              </span>
                            </div>
                            <div className="contact-role">{contact.role}</div>
                            <div className="contact-email">{contact.email}</div>
                            {result?.send_mode === 'auto' && company.selected_contact?.email === contact.email && (
                              <div className="selected-contact-tag">Auto-selected for sending</div>
                            )}
                            {result?.send_mode === 'manual' && (
                              <button
                                type="button"
                                className={`copy-button recipient-select-btn ${selectedRecipientMap[company.company_name] === contact.email ? 'active' : ''}`}
                                onClick={() => handleToggleRecipient(company, contact)}
                              >
                                {selectedRecipientMap[company.company_name] === contact.email ? 'Unselect Recipient' : 'Select Recipient'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="section-block">
                      <div className="email-preview-header">
                        <div className="section-title">Email Template Preview</div>
                        <div className="email-actions">
                          {!editingTemplateMap[company.company_name] && (
                            <button
                              type="button"
                              className="copy-button"
                              onClick={() => startTemplateEdit(company)}
                            >
                              Edit Template
                            </button>
                          )}
                          <button type="button" className="copy-button" onClick={() => handleCopyEmail(company)}>
                            <Copy size={14} />
                            {copiedEmailKey === company.company_name ? 'Copied' : 'Copy Email'}
                          </button>
                          {result?.send_mode === 'auto' && effectivePdfFilename && (
                            <button
                              type="button"
                              className="copy-button"
                              onClick={() => openPdfPreview(effectivePdfFilename, activeDesignation)}
                            >
                              Preview PDF
                            </button>
                          )}
                          {result?.send_mode === 'manual' && company.outreach?.status === 'manual_pending' && (
                            <button
                              type="button"
                              className="copy-button send-manual-button"
                              onClick={() => handleManualSend(company.company_name)}
                              disabled={manualSendingMap[company.company_name] || (!String(testRecipientEmail || '').trim() && !selectedRecipientMap[company.company_name])}
                            >
                              {manualSendingMap[company.company_name] ? (
                                <>
                                  <LoaderCircle size={14} className="spin-animation" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Send size={14} />
                                  Send Email
                                </>
                              )}
                            </button>
                          )}
                          {result?.send_mode === 'manual' && String(testRecipientEmail || '').trim() && (
                            <span className="mode-helper-text">Test recipient override active: send will go to {String(testRecipientEmail || '').trim()}</span>
                          )}
                        </div>
                      </div>
                      <div className="email-preview-box">
                        {editingTemplateMap[company.company_name] ? (
                          <div className="template-edit-form">
                            <label className="template-label">Subject</label>
                            <input
                              className="input-field"
                              type="text"
                              value={templateDrafts[company.company_name]?.subject || ''}
                              onChange={(event) => updateTemplateDraft(company.company_name, 'subject', event.target.value)}
                            />
                            <label className="template-label">Body</label>
                            <textarea
                              className="input-field template-body-editor"
                              value={templateDrafts[company.company_name]?.email_content || ''}
                              onChange={(event) => updateTemplateDraft(company.company_name, 'email_content', event.target.value)}
                            />
                            <div className="template-edit-actions">
                              <button
                                type="button"
                                className="copy-button"
                                onClick={() => saveTemplateEdit(company.company_name)}
                              >
                                Save Template
                              </button>
                              <button
                                type="button"
                                className="copy-button"
                                onClick={() => cancelTemplateEdit(company.company_name)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="email-subject">
                              Subject: {getResolvedTemplateForCompany(company)?.subject ?? company.outreach?.subject}
                            </div>
                            <pre>{extractBodyFromJsonLike(getResolvedTemplateForCompany(company)?.email_content ?? company.outreach?.email_content)}</pre>

                            <div className="pdf-preview-card">
                              <div className="pdf-preview-meta">
                                <div className="pdf-preview-title">Best PDF for {activeDesignation}</div>
                                <div className="pdf-preview-subtitle">{effectivePdfFilename}</div>
                              </div>
                              <button
                                type="button"
                                className="copy-button"
                                onClick={() => openPdfPreview(effectivePdfFilename, activeDesignation)}
                              >
                                Preview PDF
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="company-footer">
                      <div className={`status-pill ${
                        company.outreach?.status === 'sent' ? '' :
                        company.outreach?.status === 'manual_pending' ? 'status-pending' :
                        company.outreach?.status === 'not_selected' ? 'status-muted' :
                        'status-failed'
                      }`}>
                        {company.outreach?.status === 'sent' ? '✓ Sent' :
                          company.outreach?.status === 'manual_pending' ? '⏳ Pending Send' :
                          company.outreach?.status === 'not_selected' ? '— Not Selected' :
                          '✗ Failed'}
                      </div>
                      <span className="status-message">{company.outreach?.message}</span>
                    </div>
                  </article>
                    );
                  })()
                ))}
              </div>
            </>
          )}
        </section>
        </main>
      </div>

      {creditsModalOpen && (
        <div className="fixed inset-0 z-[2600] bg-black/65 backdrop-blur-sm flex items-center justify-center px-4" onClick={() => setCreditsModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-amber-400/25 bg-[#0b0b12] p-5" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-white text-lg font-semibold">Credits Exhausted</h3>
            <p className="text-[#A1A1AA] text-sm mt-2">Your credits are exhausted for this billing cycle.</p>
            <p className="text-[#A1A1AA] text-sm mt-1">
              They will reset automatically next month{creditsInfo.nextResetAt ? ` on ${new Date(creditsInfo.nextResetAt).toLocaleDateString()}` : ''}.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className="copy-button" onClick={() => setCreditsModalOpen(false)}>Okay</button>
            </div>
          </div>
        </div>
      )}

      {pdfPreviewModal && (
        <div className="pdf-modal-overlay" onClick={closePdfPreview}>
          <div className="pdf-modal" onClick={(event) => event.stopPropagation()}>
            <div className="pdf-modal-header">
              <div>
                <div className="pdf-modal-title">PDF Preview</div>
                <div className="pdf-modal-subtitle">{pdfPreviewModal.designation} - {pdfPreviewModal.filename}</div>
              </div>
              <div className="pdf-modal-actions">
                <a
                  className="copy-button pdf-download-btn"
                  href={pdfPreviewModal.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
                <button type="button" className="pdf-modal-close" onClick={closePdfPreview} aria-label="Close PDF preview">X</button>
              </div>
            </div>
            <iframe title="Pitch PDF preview" src={pdfPreviewModal.url} className="pdf-modal-frame" />
          </div>
        </div>
      )}

      <div
        className={`history-drawer-overlay ${historyPanelOpen ? 'open' : ''}`}
        onClick={() => setHistoryPanelOpen(false)}
      />

      <aside className={`history-drawer ${historyPanelOpen ? 'open' : ''}`}>
        <div className="history-drawer-head">
          <div>
            <h3>History</h3>
            <p>Your past ICP workflow runs</p>
          </div>
          <button
            type="button"
            className="history-close-btn"
            onClick={() => setHistoryPanelOpen(false)}
            aria-label="Close history panel"
          >
            <XCircle size={18} />
          </button>
        </div>

        <div className="history-drawer-body">
          {historyError && <div className="error-banner">{historyError}</div>}
          {historyLoading && <div className="history-loading">Loading history...</div>}
          {!historyLoading && historyItems.length === 0 && (
            <div className="history-empty">No saved history found yet.</div>
          )}

          {!historyLoading && historyItems.map((item) => (
            <article key={item.id} className="history-card">
              <div className="history-card-head">
                <span className="history-card-label">ICP</span>
                <div className="history-card-menu-wrap">
                  <button
                    type="button"
                    className="history-menu-btn"
                    onClick={() => {
                      setHistoryMenuOpenFor((prev) => (prev === item.id ? '' : item.id));
                      setHistoryRenamingId('');
                      setHistoryRenameDraft('');
                    }}
                  >
                    <EllipsisVertical size={14} />
                  </button>
                  {historyMenuOpenFor === item.id && (
                    <div className="history-menu-popup">
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryRenamingId(item.id);
                          setHistoryRenameDraft(item.icp || '');
                          setHistoryMenuOpenFor('');
                        }}
                      >
                        <Pencil size={12} />
                        Rename
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => handleDeleteHistory(item.id)}
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {historyRenamingId === item.id ? (
                <div className="history-rename-row">
                  <input
                    className="input-field"
                    type="text"
                    value={historyRenameDraft}
                    onChange={(event) => setHistoryRenameDraft(event.target.value)}
                    placeholder="Rename ICP"
                  />
                  <div className="history-rename-actions">
                    <button type="button" className="copy-button" onClick={() => handleRenameHistory(item.id)}>Save</button>
                    <button
                      type="button"
                      className="copy-button"
                      onClick={() => {
                        setHistoryRenamingId('');
                        setHistoryRenameDraft('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="history-card-open"
                  onClick={() => handleOpenHistoryItem(item.id)}
                >
                  <div className="history-card-icp">{item.icp}</div>
                  <div className="history-card-meta">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    <span>{String(item.sendMode || 'auto').toUpperCase()} mode</span>
                    <span>{historyDetailLoadingId === item.id ? 'Opening...' : 'Open'}</span>
                  </div>
                </button>
              )}
            </article>
          ))}
        </div>
      </aside>

      {historyDetailItem && (
        <div className="history-detail-overlay" onClick={closeHistoryDetail}>
          <div className="history-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="history-detail-head">
              <div>
                <h3>ICP Result</h3>
                <p>{historyDetailItem.icp}</p>
              </div>
              <div className="history-detail-actions">
                <button type="button" className="copy-button" onClick={openHistoryInWorkspace}>Load in Workspace</button>
                <button type="button" className="history-close-btn" onClick={closeHistoryDetail}>
                  <XCircle size={18} />
                </button>
              </div>
            </div>

            <div className="history-detail-summary">
              <div><strong>{historyDetailItem.result?.status || 'unknown'}</strong><span>Status</span></div>
              <div><strong>{historyDetailItem.result?.summary?.company_count || 0}</strong><span>Companies</span></div>
              <div><strong>{historyDetailItem.result?.summary?.emails_sent || 0}</strong><span>Sent</span></div>
              <div><strong>{historyDetailItem.result?.summary?.emails_failed || 0}</strong><span>Failed</span></div>
            </div>

            <div className="history-detail-block">
              <div className="section-title">Selected Company</div>
              <div className="history-detail-selected">
                {historyDetailItem.result?.selected_company_name || 'N/A'}
              </div>
            </div>

            <div className="history-detail-block">
              <div className="section-title">Run Inputs</div>
              <div className="history-detail-grid">
                <div className="history-detail-kv"><span>Send Mode</span><strong>{String(historyDetailItem.sendMode || historyResult?.send_mode || 'auto').toUpperCase()}</strong></div>
                <div className="history-detail-kv"><span>Target Company</span><strong>{historyDetailItem.targetCompany || 'Auto discovery'}</strong></div>
                <div className="history-detail-kv"><span>Test Recipient</span><strong>{historyDetailItem.testRecipientEmail || 'Not set'}</strong></div>
                <div className="history-detail-kv"><span>Created</span><strong>{new Date(historyDetailItem.createdAt).toLocaleString()}</strong></div>
              </div>
            </div>

            <div className="history-detail-block">
              <div className="section-title">Top Ranked Companies</div>
              {historyTopRankings.length === 0 ? (
                <div className="history-detail-selected">No ranking data available.</div>
              ) : (
                <div className="history-ranking-list">
                  {historyTopRankings.map((ranked) => (
                    <div key={`history-rank-${ranked.company_name}`} className="history-ranking-item">
                      <div className="history-ranking-left">
                        <span className="history-rank-chip">#{ranked.rank}</span>
                        <strong>{ranked.company_name}</strong>
                      </div>
                      <div className="history-ranking-right">
                        <span>Signal {ranked.signal_score}</span>
                        <span>ICP {ranked.icp_score}</span>
                        <span>Final {ranked.final_score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {historySelectedCompany && (
              <div className="history-detail-block">
                <div className="section-title">Selected Company Brief</div>
                <div className="history-detail-selected">
                  <strong>{historySelectedCompany.company_name}</strong>
                  <p>{historySelectedCompany.reason || historySelectedCompany.account_brief || 'No summary available.'}</p>
                </div>
              </div>
            )}

            <div className="history-detail-block">
              <div className="section-title">Email Outcomes</div>
              <div className="history-status-list">
                {historyCompanies.length === 0 && <div className="history-detail-selected">No company outreach data available.</div>}
                {historySnapshots.map((company) => (
                  <div key={`history-status-${company.company_name}`} className="history-status-item">
                    <strong>{company.company_name}</strong>
                    <span>{company.resolvedOutreach.status}</span>
                    <p>{company.resolvedOutreach.message}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="history-detail-block">
              <div className="section-title">Agent Output Snapshot</div>
              <div className="history-company-list">
                {historySnapshots.length === 0 && (
                  <div className="history-detail-selected">No saved company payload found for this run.</div>
                )}

                {historySnapshots.map((company) => (
                  <article key={`history-company-${company.company_name}`} className="history-company-card">
                    <div className="history-company-head">
                      <div className="history-company-left">
                        <div className="company-logo-wrap history-logo-wrap">
                          {resolveCompanyVisualUrl(company) ? (
                            <img
                              src={resolveCompanyVisualUrl(company)}
                              alt={`${company.company_name} icon`}
                              className="company-logo"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                                const fallback = event.currentTarget.parentElement?.querySelector('.company-logo-fallback');
                                if (fallback) fallback.style.display = 'inline-flex';
                              }}
                            />
                          ) : null}
                          <span
                            className="company-logo-fallback"
                            style={{ display: resolveCompanyVisualUrl(company) ? 'none' : 'inline-flex' }}
                          >
                            {companyInitials(company.company_name)}
                          </span>
                        </div>
                        <div>
                          <h4>{company.company_name}</h4>
                          <p>{company.industry || 'N/A'}{company.ranked ? ` • Rank #${company.ranked.rank}` : ''}</p>
                        </div>
                      </div>
                      <span className="history-company-status">{company.resolvedOutreach.status}</span>
                    </div>

                    <p className="history-company-reason">{company.reason || company.ranked?.score_reason || 'No company reason saved.'}</p>

                    <div className="history-mini-block">
                      <div className="history-mini-title">Signals</div>
                      <div className="badge-row">
                        {(company.signal_categories || []).map((signalCode) => (
                          <span key={`history-signal-${company.company_name}-${signalCode}`} className="signal-badge">{signalCode}</span>
                        ))}
                      </div>
                      <div className="history-signal-list">
                        {Object.entries(company.verified_signals || {}).map(([signalCode, signal]) => (
                          <div key={`history-signal-item-${company.company_name}-${signalCode}`} className="history-signal-item">
                            <span className="signal-badge">{signalCode}</span>
                            <p>{typeof signal === 'string' ? signal : signal?.content || 'No signal text available.'}</p>
                          </div>
                        ))}
                        {Object.keys(company.verified_signals || {}).length === 0 && (
                          <div className="history-detail-selected">No verified signal details saved.</div>
                        )}
                      </div>
                    </div>

                    <div className="history-mini-block">
                      <div className="history-mini-title">Account Brief</div>
                      <div className="history-detail-selected">{company.account_brief || 'No account brief saved.'}</div>
                    </div>

                    <div className="history-mini-block">
                      <div className="history-mini-title">Email Finder</div>
                      <div className="history-contact-list">
                        {(company.contacts || []).map((contact) => (
                          <div key={`history-contact-${company.company_name}-${contact.email}`} className="history-contact-item">
                            <div className="contact-person-block">
                              <div className="contact-avatar-wrap">
                                {resolveContactAvatar(contact) ? (
                                  <img
                                    src={resolveContactAvatar(contact)}
                                    alt={`${contact.person_name || contact.email} avatar`}
                                    className="contact-avatar"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(event) => {
                                      event.currentTarget.style.display = 'none';
                                      const fallback = event.currentTarget.parentElement?.querySelector('.contact-avatar-fallback');
                                      if (fallback) fallback.style.display = 'inline-flex';
                                    }}
                                  />
                                ) : null}
                                <span
                                  className="contact-avatar-fallback"
                                  style={{ display: resolveContactAvatar(contact) ? 'none' : 'inline-flex' }}
                                >
                                  {contactInitials(contact.person_name, contact.email)}
                                </span>
                              </div>
                              <div>
                                <strong>{contact.person_name || 'Unknown Contact'}</strong>
                                <p>{contact.role || 'N/A'} • {contact.email || 'N/A'}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {(company.contacts || []).length === 0 && (
                          <div className="history-detail-selected">No contacts were captured for this company in this run.</div>
                        )}
                      </div>
                    </div>

                    <div className="history-mini-block">
                      <div className="history-mini-title">Email Template</div>
                      <div className="history-template-box">
                        <div className="email-subject">Subject: {company.resolvedOutreach.subject || company.outreach?.subject || 'Not available'}</div>
                        <pre>{extractBodyFromJsonLike(company.resolvedOutreach.email_content || company.outreach?.email_content || 'Template not generated in this run.')}</pre>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
