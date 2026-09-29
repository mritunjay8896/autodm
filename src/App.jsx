import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase.js';
import {
  MessageSquare,
  LogOut,
  User as UserIcon,
  Zap,
  AlertCircle,
  CheckCircle2,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Radio,
  Play,
  Send,
  Sliders,
  Instagram,
  Terminal,
  Clock,
  Users,
  Unlink
} from 'lucide-react';

// ==========================================
// User Record Sync in Firestore (/users/{userId})
// ==========================================
async function syncUserRecord(authUser) {
  if (!authUser || !authUser.uid) return null;
  const userDocRef = doc(db, 'users', authUser.uid);
  let existingCreatedAt = null;

  try {
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      existingCreatedAt = snap.data()?.createdAt || null;
    }
  } catch (err) {
    console.info('Checking user record in Firestore:', err?.message || err);
  }

  const userData = {
    uid: authUser.uid,
    name: authUser.displayName || 'Instagram Creator',
    email: authUser.email || '',
    createdAt: existingCreatedAt || new Date().toISOString()
  };

  try {
    await setDoc(userDocRef, userData, { merge: true });
    return userData;
  } catch (error) {
    console.warn('Firestore write notice:', error);
  }
}

const INSTAGRAM_APP_ID = "1097121733196692";
const INSTAGRAM_ACCESS_TOKEN = "IGAAPl048uu5RBZAGE3WEZAEVXdUTVNyeXdULVh1YUZAIRGo2aXlMbG1fY0FuMHl1OFZAxdTBmN2lQVkVfeF9XaWNDR2ZARV3d6ZAVVvYmUtUk5wbmNIRnpDOE9GVXBEdnczelVmN2VfV3JrSlFuMkM1RDN4TkhQSU5uTUJqNkZAyNE55VQZDZD";
const DEFAULT_VERIFY_TOKEN = "IGAAPl048uu5RBZAGE3WEZAEVXdUTVNyeXdULVh1YUZAIRGo2aXlMbG1fY0FuMHl1OFZAxdTBmN2lQVkVfeF9XaWNDR2ZARV3d6ZAVVvYmUtUk5wbmNIRnpDOE9GVXBEdnczelVmN2VfV3JrSlFuMkM1RDN4TkhQSU5uTUJqNkZAyNE55VQZDZD";

const DEFAULT_FUNNEL = {
  id: 'funnel-default-1',
  name: 'Main Reel Guide Offer',
  mediaId: 'all',
  mediaCaption: 'Any Instagram Reel or Post',
  keyword: 'GUIDE',
  matchType: 'contains',
  dmMessage: 'Hey @{username}! 🚀 Thanks for your comment. Here is the link to access your free guide: https://example.com/starter-guide',
  publicReply: 'Sent you a DM! Check your inbox 📬',
  isActive: true,
  createdAt: new Date().toISOString(),
  triggerCount: 0
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Instagram Integration State
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [instagramAccount, setInstagramAccount] = useState(null);
  const [instagramMedia, setInstagramMedia] = useState([]);
  const [funnels, setFunnels] = useState([]);
  const [logs, setLogs] = useState([]);
  const [webhookInfo, setWebhookInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('funnels'); // funnels, webhook, simulator, logs
  const [isRedirectingToMeta, setIsRedirectingToMeta] = useState(false);
  const [isConnectingDemo, setIsConnectingDemo] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // New Funnel Form State
  const [isCreatingFunnel, setIsCreatingFunnel] = useState(false);
  const [newFunnel, setNewFunnel] = useState({
    name: '',
    mediaId: 'all',
    keyword: '',
    matchType: 'contains',
    dmMessage: 'Hey @{username}! 🚀 Here is the link you requested: https://',
    publicReply: 'Sent you a DM! Check your requests 📬'
  });

  // Simulator State
  const [simComment, setSimComment] = useState('Can you send me the GUIDE?');
  const [simUsername, setSimUsername] = useState('alex_creator');
  const [simMediaId, setSimMediaId] = useState('all');
  const [simResult, setSimResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Multi-tenant key helper
  const getTenantKey = (prefix) => {
    return user?.uid ? `${prefix}_${user.uid}` : prefix;
  };

  // 4. onAuthStateChanged Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle Meta OAuth callback query parameters returned from Supabase Edge Function
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const handle = params.get('handle');
    const accountId = params.get('id');
    const oauthError = params.get('error');

    if (connected === 'true') {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (user?.uid && accountId) {
        const newAcct = {
          id: accountId,
          username: handle || 'instagram_user',
          name: handle || 'Instagram User',
          accountType: 'BUSINESS',
          profilePictureUrl: '',
          accessToken: ''
        };
        setInstagramAccount(newAcct);
        setInstagramConnected(true);
        localStorage.setItem(`autodm_account_${user.uid}`, JSON.stringify(newAcct));
      }
      loadInstagramAccount();
    } else if (oauthError) {
      window.history.replaceState({}, document.title, window.location.pathname);
      console.warn("Instagram connection error:", oauthError);
    }
  }, [user?.uid]);

  // Fetch Instagram & Webhook Data when logged in (scoped to user.uid - NO INFINITE LOOP)
  useEffect(() => {
    if (user && user.uid) {
      loadInstagramAccount();
      loadFunnels();
      loadWebhookInfo();
      loadLogs();
    } else {
      setInstagramConnected(false);
      setInstagramAccount(null);
      setInstagramMedia([]);
      setFunnels([]);
    }
  }, [user?.uid]);

  /**
   * PART 1: FRONTEND META OAUTH REDIRECT HANDLER
   * Initiates Meta's secure OAuth dialog with required scopes and user.uid as state.
   */
  const handleConnectInstagram = () => {
    if (!user || !user.uid) {
      console.warn("Cannot initiate Meta OAuth without authenticated user.");
      return;
    }

    setIsRedirectingToMeta(true);

    // 1. Meta App ID template variable (configurable via VITE_META_APP_ID)
    const YOUR_META_APP_ID = import.meta.env.VITE_META_APP_ID || "1097121733196692";

    // 2. Redirect URI pointing to Supabase Edge Function (or Firebase fallback)
    const REDIRECT_URI =
      import.meta.env.VITE_AUTH_CALLBACK_URL ||
      "https://bcrxhujkttforhmotrkj.supabase.co/functions/v1/auth-instagram-callback";

    // 3. Exact Meta OAuth Scopes required for Instagram Automations
    const scope = "instagram_manage_messages,instagram_manage_comments,pages_manage_metadata,pages_show_list,pages_read_engagement";

    // 4. Construct Meta OAuth URL with required query parameters
    const metaOAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(
      YOUR_META_APP_ID
    )}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&scope=${encodeURIComponent(
      scope
    )}&response_type=code&state=${encodeURIComponent(user.uid)}`;

    // 5. Redirect the user's browser window to Meta's secure OAuth dialog endpoint
    window.location.href = metaOAuthUrl;
  };

  const loadInstagramAccount = async () => {
    if (!user || !user.uid) {
      setInstagramAccount(null);
      setInstagramConnected(false);
      return;
    }

    try {
      // 1. Check user-specific localStorage first
      const stored = localStorage.getItem(`autodm_account_${user.uid}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.id) {
            setInstagramAccount(parsed);
            setInstagramConnected(true);
            loadInstagramMedia(parsed.accessToken);
            return;
          }
        } catch (e) {}
      }

      // 2. Query Cloud Firestore /instagram_accounts for THIS tenant's user.uid
      try {
        const q = query(
          collection(db, 'instagram_accounts'),
          where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const accountDoc = snapshot.docs[0].data();
          const acct = {
            id: accountDoc.instagramAccountId,
            username: accountDoc.handle,
            name: accountDoc.handle,
            accountType: 'BUSINESS',
            profilePictureUrl: accountDoc.avatarUrl,
            accessToken: accountDoc.accessToken
          };
          setInstagramAccount(acct);
          setInstagramConnected(true);
          localStorage.setItem(`autodm_account_${user.uid}`, JSON.stringify(acct));
          loadInstagramMedia(accountDoc.accessToken);
          return;
        }
      } catch (dbErr) {
        console.warn('Firestore lookup for instagram_accounts:', dbErr?.message || dbErr);
      }

      // 3. User is NOT connected - clean disconnected state (no forced demo)
      setInstagramAccount(null);
      setInstagramConnected(false);
      setInstagramMedia([]);
    } catch (err) {
      console.warn('Notice loading Instagram account:', err);
    }
  };

  // Connect the demo @mridaliniofficial account for this tenant if requested
  const handleConnectDemoAccount = async () => {
    if (!user || !user.uid) return;
    setIsConnectingDemo(true);
    try {
      const directRes = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=id,username,account_type,name,profile_picture_url&access_token=${INSTAGRAM_ACCESS_TOKEN}`
      );
      const directData = await directRes.json();
      if (directData && directData.id) {
        const demoAcct = {
          id: directData.id,
          username: directData.username,
          name: directData.name || directData.username,
          accountType: directData.account_type || 'BUSINESS',
          profilePictureUrl: directData.profile_picture_url,
          accessToken: INSTAGRAM_ACCESS_TOKEN
        };
        setInstagramAccount(demoAcct);
        setInstagramConnected(true);
        localStorage.setItem(`autodm_account_${user.uid}`, JSON.stringify(demoAcct));

        // Save to Firestore
        try {
          await setDoc(doc(db, 'users', user.uid), {
            instagramConnected: true,
            instagramAccountId: demoAcct.id,
            instagramHandle: demoAcct.username
          }, { merge: true });
        } catch (e) {}

        loadInstagramMedia(INSTAGRAM_ACCESS_TOKEN);
      }
    } catch (err) {
      console.warn('Notice loading demo account:', err);
    } finally {
      setIsConnectingDemo(false);
    }
  };

  // Disconnect Instagram from this tenant
  const handleDisconnectInstagram = async () => {
    if (!user || !user.uid) return;
    setIsDisconnecting(true);
    try {
      localStorage.removeItem(`autodm_account_${user.uid}`);
      try {
        await setDoc(doc(db, 'users', user.uid), {
          instagramConnected: false,
          instagramAccountId: null,
          instagramHandle: null
        }, { merge: true });
      } catch (e) {}

      setInstagramAccount(null);
      setInstagramConnected(false);
      setInstagramMedia([]);
    } catch (err) {
      console.error('Error disconnecting:', err);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const loadInstagramMedia = async (token) => {
    const activeToken = token || instagramAccount?.accessToken || INSTAGRAM_ACCESS_TOKEN;
    if (!activeToken) return;

    try {
      // 1. Try local server
      const res = await fetch('/api/instagram/media').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.media) {
          setInstagramMedia(data.media);
          return;
        }
      }

      // 2. Direct Graph API fallback
      const directRes = await fetch(
        `https://graph.instagram.com/v21.0/me/media?fields=id,caption,media_type,permalink,timestamp,thumbnail_url,media_url&limit=25&access_token=${activeToken}`
      );
      const directData = await directRes.json();
      if (directData && directData.data) {
        setInstagramMedia(directData.data);
      }
    } catch (err) {
      console.warn('Notice loading Instagram media:', err);
    }
  };

  const loadFunnels = async () => {
    try {
      const storageKey = getTenantKey('autodm_funnels');
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setFunnels(JSON.parse(stored));
      } else {
        setFunnels([DEFAULT_FUNNEL]);
        localStorage.setItem(storageKey, JSON.stringify([DEFAULT_FUNNEL]));
      }
    } catch (err) {
      setFunnels([DEFAULT_FUNNEL]);
    }
  };

  const loadWebhookInfo = async () => {
    try {
      const res = await fetch('/api/webhook/info').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setWebhookInfo({
          ...data,
          cloudFunctionUrl: "https://bcrxhujkttforhmotrkj.supabase.co/functions/v1/instagram-webhook"
        });
        return;
      }
      setWebhookInfo({
        webhookUrl: "https://bcrxhujkttforhmotrkj.supabase.co/functions/v1/instagram-webhook",
        verifyToken: DEFAULT_VERIFY_TOKEN,
        appId: INSTAGRAM_APP_ID
      });
    } catch (err) {
      setWebhookInfo({
        webhookUrl: "https://bcrxhujkttforhmotrkj.supabase.co/functions/v1/instagram-webhook",
        verifyToken: DEFAULT_VERIFY_TOKEN,
        appId: INSTAGRAM_APP_ID
      });
    }
  };

  const loadLogs = async () => {
    try {
      const res = await fetch('/api/logs').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.logs) {
          setLogs(data.logs);
          return;
        }
      }
      const stored = localStorage.getItem('autodm_logs');
      if (stored) {
        setLogs(JSON.parse(stored));
      }
    } catch (err) {
      // fallback
    }
  };

  // Google Sign-In with Popup
  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, googleProvider);
      if (result?.user) {
        await syncUserRecord(result.user);
      }
    } catch (err) {
      console.error('Sign-in error:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in cancelled: Popup was closed.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setAuthError('This domain is being authorized by Firebase. Please use Quick Preview Mode or add this domain in Firebase Console.');
      } else {
        setAuthError(err.message || 'Failed to authenticate with Google.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchUser = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setInstagramAccount(null);
      setInstagramConnected(false);
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await handleGoogleSignIn();
    } catch (err) {
      console.error('Error switching user:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setInstagramConnected(false);
      setAuthError(null);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  const handleCreateFunnel = async (e) => {
    e.preventDefault();
    if (!newFunnel.keyword || !newFunnel.dmMessage) return;

    const selectedMedia = instagramMedia.find(m => m.id === newFunnel.mediaId);
    const rulePayload = {
      id: `funnel-${Date.now()}`,
      name: newFunnel.name || `Auto-DM for "${newFunnel.keyword.toUpperCase()}"`,
      mediaId: newFunnel.mediaId || 'all',
      mediaCaption: selectedMedia ? (selectedMedia.caption?.substring(0, 50) || selectedMedia.id) : 'All Posts & Reels',
      mediaPermalink: selectedMedia?.permalink || '',
      keyword: newFunnel.keyword.trim().toUpperCase(),
      matchType: newFunnel.matchType,
      dmMessage: newFunnel.dmMessage,
      publicReply: newFunnel.publicReply?.trim() || undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
      triggerCount: 0
    };

    try {
      const res = await fetch('/api/funnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rulePayload)
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.funnel) {
          setFunnels([data.funnel, ...funnels]);
        }
      } else {
        // LocalStorage fallback for GitHub Pages (tenant scoped)
        const storageKey = getTenantKey('autodm_funnels');
        const updated = [rulePayload, ...funnels];
        setFunnels(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
      }

      setIsCreatingFunnel(false);
      setNewFunnel({
        name: '',
        mediaId: 'all',
        keyword: '',
        matchType: 'contains',
        dmMessage: 'Hey @{username}! 🚀 Here is the link you requested: https://',
        publicReply: 'Sent you a DM! Check your requests 📬'
      });
    } catch (err) {
      console.error('Error creating funnel:', err);
    }
  };

  const handleToggleFunnel = async (id) => {
    try {
      const res = await fetch(`/api/funnels/${id}/toggle`, { method: 'POST' }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.funnel) {
          setFunnels(funnels.map(f => f.id === id ? data.funnel : f));
          return;
        }
      }

      const storageKey = getTenantKey('autodm_funnels');
      const updated = funnels.map(f => f.id === id ? { ...f, isActive: !f.isActive } : f);
      setFunnels(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (err) {
      console.error('Error toggling funnel:', err);
    }
  };

  const handleDeleteFunnel = async (id) => {
    try {
      await fetch(`/api/funnels/${id}`, { method: 'DELETE' }).catch(() => null);
      const storageKey = getTenantKey('autodm_funnels');
      const updated = funnels.filter(f => f.id !== id);
      setFunnels(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (err) {
      console.error('Error deleting funnel:', err);
    }
  };

  const handleRunSimulation = async (e) => {
    e.preventDefault();
    setIsSimulating(true);
    setSimResult(null);

    try {
      // 1. Try local server endpoint
      const res = await fetch('/api/webhook/test-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentText: simComment,
          username: simUsername,
          mediaId: simMediaId
        })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        setSimResult(data);
        loadLogs();
        loadFunnels();
        return;
      }

      // 2. Client-side simulation fallback for GitHub Pages
      const normalized = simComment.toUpperCase().trim();
      const matches = [];
      const updatedFunnels = funnels.map(rule => {
        if (!rule.isActive) return rule;
        if (rule.mediaId !== 'all' && rule.mediaId !== simMediaId) return rule;

        const kw = rule.keyword.toUpperCase().trim();
        const isMatch = rule.matchType === 'exact' ? normalized === kw : normalized.includes(kw);

        if (isMatch) {
          const dm = rule.dmMessage.replace(/{username}/g, simUsername).replace(/{comment}/g, simComment);
          const reply = rule.publicReply ? rule.publicReply.replace(/{username}/g, simUsername) : undefined;
          matches.push({ rule, dmContent: dm, publicReply: reply });
          return { ...rule, triggerCount: rule.triggerCount + 1 };
        }
        return rule;
      });

      setFunnels(updatedFunnels);
      localStorage.setItem('autodm_funnels', JSON.stringify(updatedFunnels));

      // Append client log
      const newLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'dm_sent',
        username: simUsername,
        ruleName: matches[0]?.rule?.name || 'Simulation',
        dmMessage: matches[0]?.dmContent || 'No keyword match',
        status: 'simulated',
        details: `Keyword matched on comment "${simComment}"`
      };
      const updatedLogs = [newLog, ...logs].slice(0, 100);
      setLogs(updatedLogs);
      localStorage.setItem('autodm_logs', JSON.stringify(updatedLogs));

      setSimResult({ success: true, processed: matches });
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Auth Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide text-slate-400">Verifying session...</p>
      </div>
    );
  }

  // ==========================================
  // IF LOGGED IN: Production Dashboard
  // ==========================================
  if (user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
        {/* Dashboard Header */}
        <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-rose-950/40">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  AutoDM
                </span>
                <span className="ml-2 text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-rose-950/70 text-rose-400 border border-rose-800/50">
                  Instagram
                </span>
              </div>
            </div>

            {/* Session Info, Switch User & Log Out */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-slate-800">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-9 h-9 rounded-full ring-2 ring-slate-800 object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-200 leading-tight flex items-center gap-1.5">
                    <span>{user.displayName || 'Creator'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-900/60 font-mono">
                      Tenant: {user.uid.slice(0, 6)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 leading-tight">
                    {user.email}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSwitchUser}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-lg transition cursor-pointer"
                title="Switch to another Google test account"
              >
                <Users className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden md:inline">Switch User</span>
              </button>

              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/70 rounded-lg transition-all cursor-pointer"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Main View */}
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full">
          {/* Top Instagram Connection Banner */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 mb-8 relative overflow-hidden backdrop-blur-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                {instagramConnected && instagramAccount?.profilePictureUrl ? (
                  <img
                    src={instagramAccount.profilePictureUrl}
                    alt={instagramAccount.username}
                    className="w-14 h-14 rounded-2xl ring-2 ring-emerald-500/50 object-cover"
                  />
                ) : instagramConnected && instagramAccount ? (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-rose-950/40">
                    <Instagram className="w-7 h-7 text-white" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <Instagram className="w-7 h-7 text-slate-400" />
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white">
                      {instagramConnected && instagramAccount
                        ? `@${instagramAccount.username}`
                        : 'Instagram Not Connected'}
                    </h2>
                    {instagramConnected && instagramAccount ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Connected ({instagramAccount?.accountType || 'BUSINESS'})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold">
                        Ready to Link
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    {instagramConnected && instagramAccount
                      ? `Account ID: ${instagramAccount.id} • Meta Graph API Active`
                      : 'Connect your Instagram Professional or Creator account (or Meta test user) for this tenant.'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {instagramConnected && instagramAccount ? (
                  <>
                    <button
                      onClick={handleConnectInstagram}
                      disabled={isRedirectingToMeta || isDisconnecting}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer disabled:opacity-50"
                      title="Connect a different Instagram account with Meta"
                    >
                      {isRedirectingToMeta ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                          <span>Redirecting to Meta...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 text-slate-400" />
                          <span>Switch / Reconnect Account</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDisconnectInstagram}
                      disabled={isRedirectingToMeta || isDisconnecting}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/60 transition cursor-pointer disabled:opacity-50"
                      title="Disconnect Instagram from this user"
                    >
                      {isDisconnecting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                          <span>Disconnecting...</span>
                        </>
                      ) : (
                        <>
                          <Unlink className="w-4 h-4" />
                          <span>Disconnect</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleConnectInstagram}
                      disabled={isRedirectingToMeta || isConnectingDemo}
                      className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-amber-500 via-rose-600 to-purple-600 hover:from-amber-600 hover:via-rose-700 hover:to-purple-700 shadow-lg shadow-rose-950/40 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isRedirectingToMeta ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Redirecting to Meta...</span>
                        </>
                      ) : (
                        <>
                          <Instagram className="w-4 h-4" />
                          <span>Connect Instagram Business Account</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleConnectDemoAccount}
                      disabled={isRedirectingToMeta || isConnectingDemo}
                      className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700 transition cursor-pointer disabled:opacity-50"
                      title="Load @mridaliniofficial test account"
                    >
                      {isConnectingDemo ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Loading Test Account...</span>
                        </>
                      ) : (
                        <>
                          <span>🧪</span>
                          <span>Use Test (@mridaliniofficial)</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-800 mb-8 overflow-x-auto pb-px">
            <button
              onClick={() => setActiveTab('funnels')}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'funnels'
                  ? 'border-rose-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-4 h-4 text-rose-500" />
              <span>Comment-to-DM Funnels</span>
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300">
                {funnels.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('webhook')}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'webhook'
                  ? 'border-rose-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-4 h-4 text-purple-400" />
              <span>Meta Webhook Setup</span>
            </button>

            <button
              onClick={() => setActiveTab('simulator')}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'simulator'
                  ? 'border-rose-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Play className="w-4 h-4 text-amber-400" />
              <span>Test Simulator</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'logs'
                  ? 'border-rose-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Activity Stream</span>
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300">
                {logs.length}
              </span>
            </button>
          </div>

          {/* TAB 1: FUNNELS (RULES) */}
          {activeTab === 'funnels' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white">Active Comment-to-DM Funnel Rules</h3>
                  <p className="text-sm text-slate-400">
                    When followers comment with your targeted keyword on Instagram, AutoDM immediately dispatches their personalized link or message.
                  </p>
                </div>

                <button
                  onClick={() => setIsCreatingFunnel(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-lg shadow-rose-950/40 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Funnel</span>
                </button>
              </div>

              {/* Create Funnel Modal */}
              {isCreatingFunnel && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-bold text-white mb-2">Create Comment-to-DM Funnel</h3>
                    <p className="text-xs text-slate-400 mb-6">
                      Define the trigger keyword and automated DM response message.
                    </p>

                    <form onSubmit={handleCreateFunnel} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Funnel Campaign Name
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g., E-Book Lead Magnet Reel"
                          value={newFunnel.name}
                          onChange={(e) => setNewFunnel({ ...newFunnel, name: e.target.value })}
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Target Instagram Post or Reel
                        </label>
                        <select
                          value={newFunnel.mediaId}
                          onChange={(e) => setNewFunnel({ ...newFunnel, mediaId: e.target.value })}
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                        >
                          <option value="all">Apply to ALL Posts & Reels (Universal Rule)</option>
                          {instagramMedia.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.media_type === 'VIDEO' ? '🎥 Reel' : '📸 Post'}: {m.caption ? m.caption.substring(0, 45) + '...' : m.id}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                            Trigger Keyword
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g., GUIDE, VIP, PRICE"
                            value={newFunnel.keyword}
                            onChange={(e) => setNewFunnel({ ...newFunnel, keyword: e.target.value })}
                            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                            Match Type
                          </label>
                          <select
                            value={newFunnel.matchType}
                            onChange={(e) => setNewFunnel({ ...newFunnel, matchType: e.target.value })}
                            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                          >
                            <option value="contains">Contains Keyword</option>
                            <option value="exact">Exact Match Only</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-slate-300">
                            Automated Direct Message (DM)
                          </label>
                          <span className="text-[11px] text-slate-500 font-mono">
                            Use {'{username}'} for personalization
                          </span>
                        </div>
                        <textarea
                          rows={3}
                          required
                          placeholder="Hey @{username}! 🚀 Here is the link you requested: https://..."
                          value={newFunnel.dmMessage}
                          onChange={(e) => setNewFunnel({ ...newFunnel, dmMessage: e.target.value })}
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Optional Public Comment Reply
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., Just sent you a DM! Check your requests 📬"
                          value={newFunnel.publicReply}
                          onChange={(e) => setNewFunnel({ ...newFunnel, publicReply: e.target.value })}
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setIsCreatingFunnel(false)}
                          className="px-4 py-2.5 text-sm text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors cursor-pointer shadow-lg shadow-rose-950/40"
                        >
                          Save & Activate Funnel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Funnels List */}
              <div className="grid grid-cols-1 gap-4">
                {funnels.length === 0 ? (
                  <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
                    <MessageSquare className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium text-sm">No funnels created yet.</p>
                    <p className="text-slate-500 text-xs mt-1">
                      Click &ldquo;Create New Funnel&rdquo; to set up your first keyword auto-responder.
                    </p>
                  </div>
                ) : (
                  funnels.map((rule) => (
                    <div
                      key={rule.id}
                      className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className="font-bold text-base text-white">{rule.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                rule.isActive
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {rule.isActive ? 'Active' : 'Paused'}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">
                              Triggered: {rule.triggerCount} times
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-3">
                            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 font-mono text-rose-400 font-bold">
                              KEYWORD: {rule.keyword} ({rule.matchType})
                            </span>
                            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
                              Post: {rule.mediaCaption || rule.mediaId}
                            </span>
                          </div>

                          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed">
                            <span className="text-slate-500 select-none mr-2 font-sans font-semibold">DM Response:</span>
                            {rule.dmMessage}
                          </div>

                          {rule.publicReply && (
                            <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
                              <span className="text-slate-500">Public reply:</span>
                              <span className="italic text-slate-300">&ldquo;{rule.publicReply}&rdquo;</span>
                            </div>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-2 sm:self-center">
                          <button
                            onClick={() => handleToggleFunnel(rule.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                              rule.isActive
                                ? 'bg-amber-950/60 border-amber-800 text-amber-400 hover:bg-amber-900/60'
                                : 'bg-emerald-950/60 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60'
                            }`}
                          >
                            {rule.isActive ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleDeleteFunnel(rule.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900 transition-colors cursor-pointer"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: META WEBHOOK SETUP */}
          {activeTab === 'webhook' && (
            <div className="max-w-4xl space-y-6">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-2">Meta Developer Webhook Configuration</h3>
                <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                  To receive real-time Instagram comments, configure the Webhook callback inside your Meta for Developers App (<code className="text-xs bg-slate-950 px-1.5 py-0.5 rounded text-rose-400">App ID: {webhookInfo?.appId || '1097121733196692'}</code>).
                </p>

                <div className="space-y-4">
                  {/* Callback URL */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Callback URL (Webhook Endpoint)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webhookInfo?.webhookUrl || `${window.location.origin}/api/webhook/instagram`}
                        className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 select-all"
                      />
                      <button
                        onClick={() => copyToClipboard(webhookInfo?.webhookUrl || `${window.location.origin}/api/webhook/instagram`, 'url')}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                      >
                        {copiedKey === 'url' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedKey === 'url' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Verify Token */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Verify Token
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webhookInfo?.verifyToken || 'auto_dm_webhook_secret_2026'}
                        className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 select-all"
                      />
                      <button
                        onClick={() => copyToClipboard(webhookInfo?.verifyToken || 'auto_dm_webhook_secret_2026', 'token')}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                      >
                        {copiedKey === 'token' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedKey === 'token' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Our server also accepts your Instagram Access Token or App Secret as verify token for instant handshake verification.
                    </p>
                  </div>
                </div>

                {/* 3 Step Meta Setup Guide */}
                <div className="mt-8 pt-6 border-t border-slate-800">
                  <h4 className="text-sm font-bold text-white mb-3">Quick Setup Steps in Meta Dashboard:</h4>
                  <ol className="space-y-3 text-xs text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                      <span>Go to <strong className="text-white">Meta for Developers</strong> &rarr; Your App (<code className="text-rose-400">1097121733196692</code>) &rarr; <strong className="text-white">Webhooks</strong>.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                      <span>Select <strong className="text-white">Instagram</strong> from the dropdown and click <strong className="text-white">Edit Subscription</strong>.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                      <span>Paste the <strong className="text-white">Callback URL</strong> and <strong className="text-white">Verify Token</strong> above, then subscribe to <code className="text-indigo-400">comments</code> and <code className="text-indigo-400">messages</code>.</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TEST SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="max-w-3xl space-y-6">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Play className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Live Comment-to-DM Simulator</h3>
                    <p className="text-xs text-slate-400">
                      Simulate a follower commenting on your Instagram Reel or Post to verify keyword matching and message composition.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleRunSimulation} className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Follower Instagram Username
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500 text-sm">@</span>
                        <input
                          type="text"
                          required
                          value={simUsername}
                          onChange={(e) => setSimUsername(e.target.value)}
                          className="w-full pl-8 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Simulated Reel / Post
                      </label>
                      <select
                        value={simMediaId}
                        onChange={(e) => setSimMediaId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="all">Any Post (Universal)</option>
                        {instagramMedia.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.media_type === 'VIDEO' ? '🎥 Reel' : '📸 Post'}: {m.caption ? m.caption.substring(0, 35) + '...' : m.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Comment Text (include your trigger keyword)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Send me the GUIDE please!"
                      value={simComment}
                      onChange={(e) => setSimComment(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSimulating}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors shadow-lg shadow-amber-950/40 cursor-pointer disabled:opacity-50"
                  >
                    {isSimulating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Processing Funnel Trigger...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Simulate Incoming Comment</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Simulation Output */}
                {simResult && (
                  <div className="mt-6 pt-6 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                      Simulation Execution Result
                    </h4>

                    {simResult.processed && simResult.processed.length > 0 ? (
                      <div className="space-y-3">
                        {simResult.processed.map((match, idx) => (
                          <div key={idx} className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60">
                            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-2">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Matched Rule: {match.rule.name} (Keyword: &quot;{match.rule.keyword}&quot;)</span>
                            </div>
                            <div className="text-xs text-slate-300 font-mono bg-slate-950 p-3 rounded-lg border border-slate-800">
                              <span className="text-slate-500">DM Dispatched to @{simUsername}:</span>
                              <div className="mt-1 text-slate-100 font-sans">{match.dmContent}</div>
                            </div>
                            {match.publicReply && (
                              <div className="mt-2 text-xs text-slate-400">
                                Comment reply posted: &ldquo;{match.publicReply}&rdquo;
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
                        No active funnel matched the comment &ldquo;{simComment}&rdquo;. Make sure you have an active rule matching the keyword in this comment!
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: ACTIVITY LOGS */}
          {activeTab === 'logs' && (
            <div className="max-w-4xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Live Event Stream</h3>
                <button
                  onClick={loadLogs}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden font-mono text-xs">
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-sans">
                    No activity recorded yet. Use the Test Simulator or publish comments on Instagram to see real-time triggers.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {logs.map((log) => (
                      <div key={log.id} className="p-4 hover:bg-slate-800/30 transition-colors flex items-start gap-4">
                        <div className="shrink-0 pt-0.5 text-slate-500 text-[11px]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                log.type === 'dm_sent'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : log.type === 'incoming_comment'
                                  ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                  : log.type === 'reply_posted'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              {log.type.toUpperCase()}
                            </span>
                            <span className="font-semibold text-slate-200">@{log.username}</span>
                            <span className="text-slate-500 text-[11px]">&bull; {log.status}</span>
                          </div>

                          {log.dmMessage && (
                            <div className="text-slate-300 bg-slate-950/70 p-2 rounded border border-slate-800 mt-1 font-sans">
                              {log.dmMessage}
                            </div>
                          )}

                          {log.commentText && !log.dmMessage && (
                            <div className="text-slate-400">
                              Comment: &ldquo;{log.commentText}&rdquo;
                            </div>
                          )}

                          {log.details && (
                            <div className="text-[11px] text-slate-500 mt-1">{log.details}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ==========================================
  // IF LOGGED OUT: Minimalist Landing Page
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-rose-950/40">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-xl tracking-tight text-white">AutoDM</span>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                Instagram Comment-to-DM Platform
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 font-mono">
              v1.0 (Auth & IG Ready)
            </span>
          </div>
        </div>
      </header>

      {/* Main Hero & Explanation Container */}
      <main className="flex-1 flex flex-col justify-center items-center px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-3xl w-full text-center">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-rose-400 text-xs font-semibold mb-8">
            <Zap className="w-3.5 h-3.5 text-rose-500" />
            <span>Turn Engagement into Conversions</span>
          </div>

          {/* Hero Heading */}
          <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-[1.1] mb-6">
            Instagram{' '}
            <span className="bg-gradient-to-r from-amber-400 via-rose-500 to-purple-500 bg-clip-text text-transparent">
              Comment-to-DM
            </span>{' '}
            Funnels
          </h1>

          {/* Value Proposition */}
          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed max-w-2xl mx-auto mb-10">
            Automate high-converting lead generation directly from your Reels and posts. When followers comment with your targeted keyword, AutoDM sends them an instant, personalized Direct Message with your link, resource, or offer.
          </p>

          {/* Auth Notice */}
          {authError && (
            <div className="mb-8 p-5 rounded-2xl bg-rose-950/50 border border-rose-800 text-rose-200 text-left text-sm max-w-xl mx-auto shadow-lg shadow-rose-950/40">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <div>
                    <span className="font-semibold text-white block mb-1">Domain Authorization Required in Firebase</span>
                    <p className="text-xs text-rose-200/90 leading-relaxed">
                      Google OAuth requires <span className="font-mono bg-rose-900/60 px-1.5 py-0.5 rounded text-white">{window.location.hostname}</span> to be added to Authorized Domains in your Firebase Console.
                    </p>
                  </div>

                  <div className="p-3 bg-black/40 rounded-xl border border-rose-900/60 text-xs text-slate-300 space-y-1.5 font-mono">
                    <div>1. Go to <a href="https://console.firebase.google.com/project/autodm-mridalini/authentication/settings" target="_blank" rel="noreferrer" className="text-rose-400 underline hover:text-rose-300">Firebase Console &rarr; Auth &rarr; Settings &rarr; Authorized domains</a></div>
                    <div>2. Click &ldquo;Add domain&rdquo; and enter: <span className="text-white font-bold">{window.location.hostname}</span></div>
                  </div>

                  <div className="pt-1 flex items-center gap-3">
                    <a
                      href="https://console.firebase.google.com/project/autodm-mridalini/authentication/settings"
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors inline-block"
                    >
                      Open Firebase Console &rarr;
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="mb-14 flex flex-col items-center justify-center gap-3">
            <button
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base sm:text-lg font-bold text-white bg-gradient-to-r from-amber-500 via-rose-600 to-purple-600 hover:from-amber-600 hover:via-rose-700 hover:to-purple-700 shadow-xl shadow-rose-950/50 hover:shadow-rose-900/80 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12 0 14.5s.7 4.8 1.9 7.2l3.7-2.9z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.9C3.7 20.9 7.5 23.5 12 23.5z"
                    />
                  </svg>
                  <span>Sign In with Google</span>
                </>
              )}
            </button>
          </div>

          {/* Minimalist 3-Step Funnel Explanation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-3xl mx-auto pt-6 border-t border-slate-900">
            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm mb-3">
                1
              </div>
              <h3 className="font-semibold text-white text-base mb-1">Create Call to Action</h3>
              <p className="text-slate-400 text-sm leading-snug">
                Post content prompting followers to comment a keyword like &ldquo;GUIDE&rdquo; or &ldquo;INFO&rdquo;.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-sm mb-3">
                2
              </div>
              <h3 className="font-semibold text-white text-base mb-1">Instant Webhook Match</h3>
              <p className="text-slate-400 text-sm leading-snug">
                AutoDM listens to incoming Instagram comments and triggers your targeted sequence within seconds.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm mb-3">
                3
              </div>
              <h3 className="font-semibold text-white text-base mb-1">Direct Message Delivery</h3>
              <p className="text-slate-400 text-sm leading-snug">
                The lead immediately receives their private link or message right inside their Instagram inbox.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <p>AutoDM Platform &bull; Step 1: Authentication &bull; Step 2: Instagram Graph API Connected</p>
      </footer>
    </div>
  );
}
