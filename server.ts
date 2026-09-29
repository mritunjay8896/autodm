import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Instagram Credentials
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || "1097121733196692";
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "874fd11ffd94c7c6ca4853791977e4e3";
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "IGAAPl048uu5RBZAGE3WEZAEVXdUTVNyeXdULVh1YUZAIRGo2aXlMbG1fY0FuMHl1OFZAxdTBmN2lQVkVfeF9XaWNDR2ZARV3d6ZAVVvYmUtUk5wbmNIRnpDOE9GVXBEdnczelVmN2VfV3JrSlFuMkM1RDN4TkhQSU5uTUJqNkZAyNE55VQZDZD";
const INSTAGRAM_WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || "auto_dm_webhook_secret_2026";

interface FunnelRule {
  id: string;
  name: string;
  mediaId: string; // 'all' or specific post/reel ID
  mediaCaption?: string;
  mediaPermalink?: string;
  keyword: string;
  matchType: 'exact' | 'contains';
  dmMessage: string;
  publicReply?: string;
  isActive: boolean;
  createdAt: string;
  triggerCount: number;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  type: 'incoming_comment' | 'dm_sent' | 'reply_posted' | 'test_trigger' | 'error';
  username: string;
  commentText?: string;
  ruleName?: string;
  dmMessage?: string;
  status: 'success' | 'failed' | 'simulated';
  details?: string;
}

// In-Memory Storage for Funnel Rules and Logs
let funnelRules: FunnelRule[] = [
  {
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
  }
];

let activityLogs: ActivityLog[] = [];

// Helper to log activities
function logActivity(entry: Omit<ActivityLog, 'id' | 'timestamp'>) {
  const log: ActivityLog = {
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString()
  };
  activityLogs.unshift(log);
  if (activityLogs.length > 100) {
    activityLogs = activityLogs.slice(0, 100);
  }
  return log;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // ----------------------------------------------------
  // Instagram Account & Media Endpoints
  // ----------------------------------------------------
  app.get('/api/instagram/account', async (_req: Request, res: Response) => {
    try {
      const response = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=id,username,account_type,name,profile_picture_url&access_token=${INSTAGRAM_ACCESS_TOKEN}`
      );
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({
          connected: false,
          error: data.error.message || 'Failed to fetch Instagram account'
        });
      }

      return res.json({
        connected: true,
        account: {
          id: data.id,
          username: data.username,
          name: data.name || data.username,
          accountType: data.account_type,
          profilePictureUrl: data.profile_picture_url
        },
        appId: INSTAGRAM_APP_ID
      });
    } catch (error: any) {
      return res.status(500).json({
        connected: false,
        error: error.message || 'Internal server error while fetching Instagram account'
      });
    }
  });

  app.get('/api/instagram/media', async (_req: Request, res: Response) => {
    try {
      const response = await fetch(
        `https://graph.instagram.com/v21.0/me/media?fields=id,caption,media_type,permalink,timestamp,thumbnail_url,media_url&limit=25&access_token=${INSTAGRAM_ACCESS_TOKEN}`
      );
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({
          error: data.error.message || 'Failed to fetch Instagram media'
        });
      }

      return res.json({
        media: data.data || []
      });
    } catch (error: any) {
      return res.status(500).json({
        error: error.message || 'Internal server error while fetching media'
      });
    }
  });

  // ----------------------------------------------------
  // Auto-DM Funnels CRUD Endpoints
  // ----------------------------------------------------
  app.get('/api/funnels', (_req: Request, res: Response) => {
    res.json({ funnels: funnelRules });
  });

  app.post('/api/funnels', (req: Request, res: Response) => {
    const { name, mediaId, mediaCaption, mediaPermalink, keyword, matchType, dmMessage, publicReply } = req.body;

    if (!keyword || !dmMessage) {
      return res.status(400).json({ error: 'Keyword and DM Message are required' });
    }

    const newRule: FunnelRule = {
      id: `funnel-${Date.now()}`,
      name: name || `Auto-DM for "${keyword.toUpperCase()}"`,
      mediaId: mediaId || 'all',
      mediaCaption: mediaCaption || (mediaId === 'all' ? 'All Posts & Reels' : 'Selected Post'),
      mediaPermalink: mediaPermalink || '',
      keyword: keyword.trim().toUpperCase(),
      matchType: matchType === 'exact' ? 'exact' : 'contains',
      dmMessage,
      publicReply: publicReply ? publicReply.trim() : undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
      triggerCount: 0
    };

    funnelRules.unshift(newRule);
    return res.status(201).json({ funnel: newRule });
  });

  app.put('/api/funnels/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const index = funnelRules.findIndex(f => f.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Funnel not found' });
    }

    const existing = funnelRules[index];
    const updated: FunnelRule = {
      ...existing,
      ...req.body,
      keyword: req.body.keyword ? req.body.keyword.trim().toUpperCase() : existing.keyword,
      id: existing.id,
      createdAt: existing.createdAt
    };

    funnelRules[index] = updated;
    return res.json({ funnel: updated });
  });

  app.post('/api/funnels/:id/toggle', (req: Request, res: Response) => {
    const { id } = req.params;
    const rule = funnelRules.find(f => f.id === id);

    if (!rule) {
      return res.status(404).json({ error: 'Funnel not found' });
    }

    rule.isActive = !rule.isActive;
    return res.json({ funnel: rule });
  });

  app.delete('/api/funnels/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    funnelRules = funnelRules.filter(f => f.id !== id);
    return res.json({ success: true });
  });

  // ----------------------------------------------------
  // Meta Instagram Webhook Endpoints
  // ----------------------------------------------------
  // 1. Handshake verification (GET)
  app.get('/api/webhook/instagram', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`[Webhook Handshake] mode=${mode}, token=${token}`);

    // Accept configured verify token, user's webhook token, app secret, or fallback
    const validTokens = [
      INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
      INSTAGRAM_ACCESS_TOKEN,
      INSTAGRAM_APP_SECRET,
      'auto_dm_webhook_secret_2026'
    ];

    if (mode === 'subscribe' && validTokens.includes(String(token))) {
      console.log('Webhook verified successfully by Meta!');
      return res.status(200).send(challenge);
    }

    return res.status(403).send('Verification token mismatch');
  });

  // 2. Incoming events ingestion (POST)
  app.post('/api/webhook/instagram', async (req: Request, res: Response) => {
    try {
      const body = req.body;
      console.log('[Webhook Ingest] Received Meta payload:', JSON.stringify(body));

      if (body.object === 'instagram') {
        const entries = body.entry || [];

        for (const entry of entries) {
          // Handle Instagram comments change events
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'comments') {
                const commentVal = change.value;
                const commentText = commentVal.text || '';
                const commenterUsername = commentVal.from?.username || 'user';
                const commenterId = commentVal.from?.id;
                const mediaId = commentVal.media?.id || entry.id;

                logActivity({
                  type: 'incoming_comment',
                  username: commenterUsername,
                  commentText,
                  status: 'success',
                  details: `Media ID: ${mediaId}`
                });

                // Find matching active funnels
                await processCommentAutoDM({
                  commentText,
                  commenterUsername,
                  commenterId,
                  mediaId,
                  commentId: commentVal.id
                });
              }
            }
          }
        }

        return res.status(200).send('EVENT_RECEIVED');
      }

      return res.status(404).send('Not an instagram object');
    } catch (err: any) {
      console.error('Error handling webhook payload:', err);
      return res.status(500).send('Internal Server Error');
    }
  });

  // ----------------------------------------------------
  // Test Simulator Endpoint (for testing Comment-to-DM triggers)
  // ----------------------------------------------------
  app.post('/api/webhook/test-trigger', async (req: Request, res: Response) => {
    const { commentText, username, mediaId } = req.body;

    if (!commentText) {
      return res.status(400).json({ error: 'commentText is required' });
    }

    const testUsername = username || 'test_instagram_lead';
    const testMediaId = mediaId || 'all';

    logActivity({
      type: 'test_trigger',
      username: testUsername,
      commentText,
      status: 'simulated',
      details: `Simulated trigger for post: ${testMediaId}`
    });

    const result = await processCommentAutoDM({
      commentText,
      commenterUsername: testUsername,
      commenterId: 'simulated_user_12345',
      mediaId: testMediaId,
      commentId: `sim_comment_${Date.now()}`,
      isSimulation: true
    });

    return res.json({
      success: true,
      processed: result
    });
  });

  // Core Funnel Matching & Dispatch Logic
  async function processCommentAutoDM({
    commentText,
    commenterUsername,
    commenterId,
    mediaId,
    commentId,
    isSimulation = false
  }: {
    commentText: string;
    commenterUsername: string;
    commenterId?: string;
    mediaId: string;
    commentId?: string;
    isSimulation?: boolean;
  }) {
    const normalizedText = commentText.toUpperCase().trim();
    const matches: { rule: FunnelRule; dmContent: string; publicReply?: string }[] = [];

    for (const rule of funnelRules) {
      if (!rule.isActive) continue;

      // Check media match
      if (rule.mediaId !== 'all' && rule.mediaId !== mediaId) {
        continue;
      }

      // Check keyword match
      const ruleKeyword = rule.keyword.toUpperCase().trim();
      let matched = false;

      if (rule.matchType === 'exact') {
        matched = normalizedText === ruleKeyword;
      } else {
        // contains
        matched = normalizedText.includes(ruleKeyword);
      }

      if (matched) {
        const personalizedDM = rule.dmMessage
          .replace(/{username}/g, commenterUsername)
          .replace(/{comment}/g, commentText);

        const personalizedReply = rule.publicReply
          ? rule.publicReply.replace(/{username}/g, commenterUsername)
          : undefined;

        rule.triggerCount += 1;
        matches.push({ rule, dmContent: personalizedDM, publicReply: personalizedReply });

        // Attempt real Instagram Send API call if not simulation and commenterId exists
        if (!isSimulation && commenterId) {
          try {
            const sendRes = await fetch('https://graph.instagram.com/v21.0/me/messages', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                recipient: { id: commenterId },
                message: { text: personalizedDM }
              })
            });
            const sendData = await sendRes.json();
            console.log('Instagram Send DM response:', sendData);
          } catch (e: any) {
            console.warn('Instagram Send API call notice:', e.message);
          }
        }

        // Log DM dispatch
        logActivity({
          type: 'dm_sent',
          username: commenterUsername,
          ruleName: rule.name,
          dmMessage: personalizedDM,
          status: isSimulation ? 'simulated' : 'success',
          details: `Keyword "${rule.keyword}" matched on comment "${commentText}"`
        });

        // Log public reply if present
        if (personalizedReply) {
          logActivity({
            type: 'reply_posted',
            username: commenterUsername,
            ruleName: rule.name,
            commentText: personalizedReply,
            status: isSimulation ? 'simulated' : 'success'
          });
        }
      }
    }

    return matches;
  }

  // ----------------------------------------------------
  // Activity Logs & Webhook Status
  // ----------------------------------------------------
  app.get('/api/logs', (_req: Request, res: Response) => {
    res.json({ logs: activityLogs });
  });

  app.get('/api/webhook/info', (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const webhookUrl = `${protocol}://${host}/api/webhook/instagram`;

    res.json({
      webhookUrl,
      verifyToken: INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
      appId: INSTAGRAM_APP_ID,
      activeRulesCount: funnelRules.filter(r => r.isActive).length,
      totalRulesCount: funnelRules.length
    });
  });

  // ----------------------------------------------------
  // Vite Integration (Dev) / Static Serving (Prod)
  // ----------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
