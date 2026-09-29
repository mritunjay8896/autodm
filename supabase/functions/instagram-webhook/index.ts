import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const WEBHOOK_VERIFY_TOKEN =
  Deno.env.get("WEBHOOK_VERIFY_TOKEN") ||
  "IGAAPl048uu5RBZAGE3WEZAEVXdUTVNyeXdULVh1YUZAIRGo2aXlMbG1fY0FuMHl1OFZAxdTBmN2lQVkVfeF9XaWNDR2ZARV3d6ZAVVvYmUtUk5wbmNIRnpDOE9GVXBEdnczelVmN2VfV3JrSlFuMkM1RDN4TkhQSU5uTUJqNkZAyNE55VQZDZD";

const DEFAULT_ACCESS_TOKEN =
  Deno.env.get("INSTAGRAM_ACCESS_TOKEN") ||
  "IGAAPl048uu5RBZAGE3WEZAEVXdUTVNyeXdULVh1YUZAIRGo2aXlMbG1fY0FuMHl1OFZAxdTBmN2lQVkVfeF9XaWNDR2ZARV3d6ZAVVvYmUtUk5wbmNIRnpDOE9GVXBEdnczelVmN2VfV3JrSlFuMkM1RDN4TkhQSU5uTUJqNkZAyNE55VQZDZD";

// In-Memory state for Edge Function instance
interface Funnel {
  id: string;
  name: string;
  keyword: string;
  matchType: "contains" | "exact";
  dmMessage: string;
  publicReply?: string;
  mediaId?: string;
  isActive: boolean;
  triggerCount: number;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  type: "incoming_comment" | "dm_sent" | "reply_posted" | "error" | "test_trigger";
  username: string;
  commentText?: string;
  ruleName?: string;
  dmMessage?: string;
  status: "success" | "failed" | "simulated";
  details?: string;
}

let activeFunnels: Funnel[] = [
  {
    id: "funnel-link-1",
    name: "Main Link Funnel",
    keyword: "LINK",
    matchType: "contains",
    dmMessage: "Hey @{username}! 🚀 Here is the link you requested: https://example.com/starter-guide",
    publicReply: "Sent you a DM! Check your requests 📬",
    mediaId: "all",
    isActive: true,
    triggerCount: 0
  },
  {
    id: "funnel-guide-2",
    name: "Free Guide Funnel",
    keyword: "GUIDE",
    matchType: "contains",
    dmMessage: "Hey @{username}! 🚀 Thanks for your comment. Here is your free guide: https://example.com/guide",
    publicReply: "Check your DMs! Sent you the guide 📬",
    mediaId: "all",
    isActive: true,
    triggerCount: 0
  }
];

let activityLogs: ActivityLog[] = [];
let accountTokens: Record<string, string> = {
  "28503726299236968": DEFAULT_ACCESS_TOKEN
};

function logEvent(entry: Omit<ActivityLog, "id" | "timestamp">) {
  const item: ActivityLog = {
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString()
  };
  activityLogs.unshift(item);
  if (activityLogs.length > 100) {
    activityLogs = activityLogs.slice(0, 100);
  }
  return item;
}

async function sendCommentToDM({
  commentId,
  commenterId,
  commenterUsername,
  commentText,
  mediaId,
  accountId
}: {
  commentId: string;
  commenterId?: string;
  commenterUsername: string;
  commentText: string;
  mediaId?: string;
  accountId: string;
}) {
  const normalizedText = (commentText || "").toUpperCase().trim();
  const token = accountTokens[accountId] || DEFAULT_ACCESS_TOKEN;

  console.log(`[Processing Comment] ID: ${commentId} from @${commenterUsername}: "${commentText}"`);

  let matchedAny = false;

  for (const funnel of activeFunnels) {
    if (!funnel.isActive) continue;

    // Check media filter
    if (funnel.mediaId && funnel.mediaId !== "all" && mediaId && funnel.mediaId !== mediaId) {
      continue;
    }

    const keyword = (funnel.keyword || "").toUpperCase().trim();
    const isMatch =
      funnel.matchType === "exact"
        ? normalizedText === keyword
        : normalizedText.includes(keyword);

    if (isMatch) {
      matchedAny = true;
      funnel.triggerCount += 1;

      const personalizedDM = (funnel.dmMessage || "")
        .replace(/{username}/g, commenterUsername)
        .replace(/{comment}/g, commentText);

      const personalizedReply = funnel.publicReply
        ? funnel.publicReply.replace(/{username}/g, commenterUsername)
        : null;

      // 1. Send Instagram Private Reply (Comment to DM)
      // Meta Graph API: POST https://graph.facebook.com/v21.0/{account_id}/messages
      // recipient: { "comment_id": commentId }
      let dmSent = false;

      // Method A: Instagram Direct messages with comment_id recipient
      try {
        const url = `https://graph.facebook.com/v21.0/${accountId}/messages`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            recipient: { comment_id: commentId },
            message: { text: personalizedDM }
          })
        });

        const resData = await res.json();
        if (res.ok && (resData.message_id || resData.recipient_id)) {
          dmSent = true;
          logEvent({
            type: "dm_sent",
            username: commenterUsername,
            commentText,
            ruleName: funnel.name,
            dmMessage: personalizedDM,
            status: "success",
            details: `Delivered via comment_id (${commentId})`
          });
          console.log(`[AutoDM SUCCESS] Sent DM to @${commenterUsername} for keyword "${funnel.keyword}"`);
        } else {
          console.warn("[AutoDM Method A notice]:", resData);
        }
      } catch (err: any) {
        console.warn("[AutoDM Method A error]:", err.message);
      }

      // Method B: Graph Instagram direct endpoint with comment_id
      if (!dmSent) {
        try {
          const url = "https://graph.instagram.com/v21.0/me/messages";
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              recipient: { comment_id: commentId },
              message: { text: personalizedDM }
            })
          });
          const resData = await res.json();
          if (res.ok && (resData.message_id || resData.recipient_id)) {
            dmSent = true;
            logEvent({
              type: "dm_sent",
              username: commenterUsername,
              commentText,
              ruleName: funnel.name,
              dmMessage: personalizedDM,
              status: "success",
              details: `Delivered via Instagram me/messages`
            });
            console.log(`[AutoDM SUCCESS Method B] Sent DM to @${commenterUsername}`);
          } else {
            console.warn("[AutoDM Method B notice]:", resData);
          }
        } catch (err: any) {
          console.warn("[AutoDM Method B error]:", err.message);
        }
      }

      // Method C: If commenterId exists, send to user id directly
      if (!dmSent && commenterId) {
        try {
          const url = "https://graph.instagram.com/v21.0/me/messages";
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              recipient: { id: commenterId },
              message: { text: personalizedDM }
            })
          });
          const resData = await res.json();
          if (res.ok && resData.message_id) {
            dmSent = true;
            logEvent({
              type: "dm_sent",
              username: commenterUsername,
              commentText,
              ruleName: funnel.name,
              dmMessage: personalizedDM,
              status: "success",
              details: `Delivered via commenter id (${commenterId})`
            });
          }
        } catch (err: any) {
          console.warn("[AutoDM Method C error]:", err.message);
        }
      }

      if (!dmSent) {
        logEvent({
          type: "dm_sent",
          username: commenterUsername,
          commentText,
          ruleName: funnel.name,
          dmMessage: personalizedDM,
          status: "failed",
          details: `Meta API requires app permissions or commenter thread authorization`
        });
      }

      // 2. Post Public Comment Reply (if configured)
      if (personalizedReply) {
        try {
          const replyUrl = `https://graph.facebook.com/v21.0/${commentId}/replies`;
          const replyRes = await fetch(replyUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: personalizedReply })
          });
          const replyData = await replyRes.json();
          if (replyRes.ok && replyData.id) {
            logEvent({
              type: "reply_posted",
              username: commenterUsername,
              commentText,
              ruleName: funnel.name,
              status: "success",
              details: `Public reply posted: "${personalizedReply}"`
            });
            console.log(`[AutoDM SUCCESS] Posted public reply to comment ${commentId}`);
          }
        } catch (rErr: any) {
          console.warn("[Public Reply notice]:", rErr.message);
        }
      }
    }
  }

  if (!matchedAny) {
    console.log(`Comment "${commentText}" by @${commenterUsername} did not match any active funnels.`);
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    return new Response("OK", { headers: corsHeaders });
  }

  // -----------------------------------------------------------------
  // 1. API: SYNC FUNNELS FROM FRONTEND
  // -----------------------------------------------------------------
  if (action === "sync" && req.method === "POST") {
    try {
      const data = await req.json();
      if (data.funnels && Array.isArray(data.funnels)) {
        activeFunnels = data.funnels;
      }
      if (data.accountId && data.accessToken) {
        accountTokens[data.accountId] = data.accessToken;
      }
      return new Response(JSON.stringify({ success: true, count: activeFunnels.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // -----------------------------------------------------------------
  // 2. API: GET LIVE ACTIVITY LOGS
  // -----------------------------------------------------------------
  if (action === "logs" && req.method === "GET") {
    return new Response(JSON.stringify({ logs: activityLogs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // -----------------------------------------------------------------
  // 3. API: TEST SIMULATION DISPATCH
  // -----------------------------------------------------------------
  if (action === "test" && req.method === "POST") {
    try {
      const data = await req.json();
      const testUsername = data.username || "test_follower";
      const testComment = data.commentText || "LINK";
      const testMediaId = data.mediaId || "all";
      const testAccountId = data.accountId || "28503726299236968";

      logEvent({
        type: "test_trigger",
        username: testUsername,
        commentText: testComment,
        status: "simulated",
        details: `Simulated trigger for post: ${testMediaId}`
      });

      await sendCommentToDM({
        commentId: `sim_${Date.now()}`,
        commenterId: "sim_user_123",
        commenterUsername: testUsername,
        commentText: testComment,
        mediaId: testMediaId,
        accountId: testAccountId
      });

      return new Response(JSON.stringify({ success: true, message: "Simulation processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // -----------------------------------------------------------------
  // 4. META WEBHOOK HANDSHAKE VERIFICATION (GET)
  // -----------------------------------------------------------------
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log(`[Webhook GET] mode=${mode}, token=${token}`);

    const acceptedTokens = [
      WEBHOOK_VERIFY_TOKEN,
      DEFAULT_ACCESS_TOKEN,
      "auto_dm_webhook_secret_2026",
      "874fd11ffd94c7c6ca4853791977e4e3"
    ];

    if (mode === "subscribe" && acceptedTokens.includes(String(token))) {
      console.log("Meta Webhook verification succeeded!");
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    }

    console.warn("Meta Webhook verification failed. Token mismatch.");
    return new Response("Forbidden: Invalid verify token", { status: 403 });
  }

  // -----------------------------------------------------------------
  // 5. META WEBHOOK EVENT INGESTION (POST)
  // -----------------------------------------------------------------
  if (req.method === "POST") {
    try {
      const payload = await req.json();
      console.log("Received Instagram Event:", JSON.stringify(payload));

      if (payload.entry && Array.isArray(payload.entry)) {
        for (const entry of payload.entry) {
          const accountId = entry.id || "28503726299236968";

          // Process 'changes' format (Instagram Graph API comments)
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (change.field === "comments" && change.value) {
                const comment = change.value;
                const commenterUsername = comment.from?.username || "instagram_user";
                const commenterId = comment.from?.id;
                const commentText = comment.text || "";
                const mediaId = comment.media?.id || entry.id;
                const commentId = comment.id;

                logEvent({
                  type: "incoming_comment",
                  username: commenterUsername,
                  commentText,
                  status: "success",
                  details: `Comment ID: ${commentId} on Media ${mediaId}`
                });

                // Trigger asynchronous AutoDM process
                await sendCommentToDM({
                  commentId,
                  commenterId,
                  commenterUsername,
                  commentText,
                  mediaId,
                  accountId
                });
              }
            }
          }

          // Process 'messaging' format (Instagram Messaging Webhook direct events)
          if (entry.messaging && Array.isArray(entry.messaging)) {
            for (const msg of entry.messaging) {
              if (msg.message && msg.sender) {
                console.log(`Received DM from ${msg.sender.id}: ${msg.message.text}`);
              }
            }
          }
        }
      }

      // Always return 200 immediately to Meta so webhook does not timeout
      return new Response("EVENT_RECEIVED", {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    } catch (err: any) {
      console.error("Error processing webhook payload:", err);
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
