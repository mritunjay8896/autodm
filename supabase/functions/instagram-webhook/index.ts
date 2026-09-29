import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://bcrxhujkttforhmotrkj.supabase.co";
const SUPABASE_SERVICE_ROLE =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcnhodWprdHRmb3JobW90cmtqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDY4MDkzNCwiZXhwIjoyMTA2MjU2OTM0fQ.t_zEF5FrYyg1nLf80FtHj4Be9UgrH5LgF5wnFaxC5YI";

const WEBHOOK_VERIFY_TOKEN =
  Deno.env.get("WEBHOOK_VERIFY_TOKEN") || "auto_dm_webhook_secret_2026";

const DEFAULT_ACCESS_TOKEN =
  Deno.env.get("INSTAGRAM_ACCESS_TOKEN") ||
  "IGAAPl048uu5RBZAGE3WEZAEVXdUTVNyeXdULVh1YUZAIRGo2aXlMbG1fY0FuMHl1OFZAxdTBmN2lQVkVfeF9XaWNDR2ZARV3d6ZAVVvYmUtUk5wbmNIRnpDOE9GVXBEdnczelVmN2VfV3JrSlFuMkM1RDN4TkhQSU5uTUJqNkZAyNE55VQZDZD";

interface FunnelRow {
  id: string;
  name: string;
  keyword: string;
  match_type: string;
  dm_message: string;
  public_reply?: string;
  media_id: string;
  is_active: boolean;
  trigger_count: number;
}

async function recordLog(log: {
  type: string;
  username: string;
  comment_text?: string;
  rule_name?: string;
  dm_message?: string;
  status: string;
  details?: string;
}) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/activity_logs`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        ...log
      })
    });
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
}

async function getFunnels(): Promise<FunnelRow[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/funnels?is_active=eq.true`, {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (e) {
    console.warn("Could not query funnels from db:", e);
  }

  return [
    {
      id: "funnel-link-fallback",
      name: "Main Link Funnel",
      keyword: "LINK",
      match_type: "contains",
      dm_message: "Hey @{username}! 🚀 Here is the link you requested: https://app.mridalini.com",
      public_reply: "Sent you a DM! Check your requests 📬",
      media_id: "all",
      is_active: true,
      trigger_count: 0
    }
  ];
}

async function getAccessToken(accountId: string): Promise<string> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/instagram_tokens?account_id=eq.${encodeURIComponent(accountId)}`,
      {
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE}`
        }
      }
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows && rows.length > 0 && rows[0].access_token) {
        return rows[0].access_token;
      }
    }
  } catch (e) {}

  return DEFAULT_ACCESS_TOKEN;
}

async function incrementTriggerCount(funnelId: string) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_funnel`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ f_id: funnelId })
    }).catch(() => null);
  } catch (e) {}
}

async function processIncomingComment({
  commentId,
  commenterUsername,
  commentText,
  mediaId,
  accountId
}: {
  commentId: string;
  commenterUsername: string;
  commentText: string;
  mediaId?: string;
  accountId: string;
}) {
  const normalizedText = (commentText || "").toUpperCase().trim();
  const token = await getAccessToken(accountId);
  const funnels = await getFunnels();

  console.log(`[Processing Comment] @${commenterUsername}: "${commentText}" on post ${mediaId}`);

  await recordLog({
    type: "incoming_comment",
    username: commenterUsername,
    comment_text: commentText,
    status: "success",
    details: `Comment ID: ${commentId} on Media: ${mediaId || "post"}`
  });

  let matched = false;

  for (const funnel of funnels) {
    if (!funnel.is_active) continue;

    // Filter by Media if specific
    if (funnel.media_id && funnel.media_id !== "all" && mediaId && funnel.media_id !== mediaId) {
      continue;
    }

    const keyword = (funnel.keyword || "").toUpperCase().trim();
    const isMatch =
      funnel.match_type === "exact"
        ? normalizedText === keyword
        : normalizedText.includes(keyword);

    if (isMatch) {
      matched = true;
      incrementTriggerCount(funnel.id);

      const dmText = (funnel.dm_message || "")
        .replace(/{username}/g, commenterUsername)
        .replace(/{comment}/g, commentText);

      const replyText = funnel.public_reply
        ? funnel.public_reply.replace(/{username}/g, commenterUsername)
        : null;

      // ---------------------------------------------------------------
      // 1. Meta Official Instagram Comment-to-DM Private Reply
      // POST https://graph.instagram.com/v21.0/me/messages
      // recipient: { "comment_id": commentId }
      // ---------------------------------------------------------------
      let dmSent = false;

      try {
        const msgRes = await fetch("https://graph.instagram.com/v21.0/me/messages", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            recipient: { comment_id: commentId },
            message: { text: dmText }
          })
        });

        const msgData = await msgRes.json();

        if (msgRes.ok && (msgData.message_id || msgData.recipient_id)) {
          dmSent = true;
          await recordLog({
            type: "dm_sent",
            username: commenterUsername,
            comment_text: commentText,
            rule_name: funnel.name,
            dm_message: dmText,
            status: "success",
            details: `Delivered via comment_id: ${commentId}`
          });
          console.log(`[AutoDM SUCCESS] Sent private reply DM to @${commenterUsername}`);
        } else {
          console.warn("[Instagram API graph.instagram.com me/messages notice]:", msgData);
        }
      } catch (err: any) {
        console.warn("[Private Reply error 1]:", err.message);
      }

      // Fallback: graph.facebook.com/{account_id}/messages
      if (!dmSent) {
        try {
          const fbMsgUrl = `https://graph.facebook.com/v21.0/${accountId}/messages`;
          const fbRes = await fetch(fbMsgUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              recipient: { comment_id: commentId },
              message: { text: dmText }
            })
          });

          const fbData = await fbRes.json();
          if (fbRes.ok && (fbData.message_id || fbData.recipient_id)) {
            dmSent = true;
            await recordLog({
              type: "dm_sent",
              username: commenterUsername,
              comment_text: commentText,
              rule_name: funnel.name,
              dm_message: dmText,
              status: "success",
              details: `Delivered via graph.facebook.com (${accountId})`
            });
          } else {
            console.warn("[Facebook messages notice]:", fbData);
          }
        } catch (fbErr: any) {
          console.warn("[Private Reply error 2]:", fbErr.message);
        }
      }

      if (!dmSent) {
        await recordLog({
          type: "dm_sent",
          username: commenterUsername,
          comment_text: commentText,
          rule_name: funnel.name,
          dm_message: dmText,
          status: "failed",
          details: `Meta API requires app in Live Mode or test user added as Instagram Tester`
        });
      }

      // ---------------------------------------------------------------
      // 2. Post Public Reply on Instagram Comment
      // POST https://graph.instagram.com/v21.0/{comment_id}/replies
      // ---------------------------------------------------------------
      if (replyText) {
        try {
          const replyUrl = `https://graph.instagram.com/v21.0/${commentId}/replies`;
          const replyRes = await fetch(replyUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: replyText })
          });
          const replyData = await replyRes.json();
          if (replyRes.ok && replyData.id) {
            await recordLog({
              type: "reply_posted",
              username: commenterUsername,
              comment_text: commentText,
              rule_name: funnel.name,
              status: "success",
              details: `Public reply posted: "${replyText}"`
            });
          }
        } catch (rErr) {}
      }
    }
  }

  if (!matched) {
    console.log(`Comment "${commentText}" did not match any active keywords.`);
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey"
  };

  if (req.method === "OPTIONS") {
    return new Response("OK", { headers: corsHeaders });
  }

  // 1. Webhook Handshake Verification (Meta calls GET)
  if (req.method === "GET" && !action) {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log(`[Meta Webhook Handshake] mode=${mode}, token=${token}`);

    const acceptedTokens = [
      WEBHOOK_VERIFY_TOKEN,
      DEFAULT_ACCESS_TOKEN,
      "auto_dm_webhook_secret_2026",
      "874fd11ffd94c7c6ca4853791977e4e3"
    ];

    if (mode === "subscribe" && acceptedTokens.includes(String(token))) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    }

    return new Response("Forbidden: Verify token mismatch", { status: 403 });
  }

  // 2. Manual Test Trigger Simulation (for UI Simulator)
  if (action === "test" && req.method === "POST") {
    try {
      const data = await req.json();
      const testUsername = data.username || "test_user";
      const testComment = data.commentText || "LINK";
      const testMediaId = data.mediaId || "all";
      const testAccountId = data.accountId || "28503726299236968";

      await processIncomingComment({
        commentId: `sim_${Date.now()}`,
        commenterUsername: testUsername,
        commentText: testComment,
        mediaId: testMediaId,
        accountId: testAccountId
      });

      return new Response(JSON.stringify({ success: true, message: "Simulated comment processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // 3. Webhook Event Ingestion (Meta calls POST when comments or messages occur)
  if (req.method === "POST") {
    try {
      const payload = await req.json();
      console.log("Incoming Meta Event:", JSON.stringify(payload));

      if (payload.entry && Array.isArray(payload.entry)) {
        for (const entry of payload.entry) {
          const accountId = entry.id || "28503726299236968";

          // Process comments from 'changes' array
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (change.field === "comments" && change.value) {
                const comment = change.value;
                const commenterUsername = comment.from?.username || "instagram_user";
                const commentText = comment.text || "";
                const mediaId = comment.media?.id || entry.id;
                const commentId = comment.id;

                await processIncomingComment({
                  commentId,
                  commenterUsername,
                  commentText,
                  mediaId,
                  accountId
                });
              }
            }
          }
        }
      }

      return new Response("EVENT_RECEIVED", {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    } catch (err: any) {
      console.error("Webhook processing error:", err);
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
