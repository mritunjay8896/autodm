import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const WEBHOOK_VERIFY_TOKEN =
  Deno.env.get("WEBHOOK_VERIFY_TOKEN") ||
  "IGAAPl048uu5RBZAGE3WEZAEVXdUTVNyeXdULVh1YUZAIRGo2aXlMbG1fY0FuMHl1OFZAxdTBmN2lQVkVfeF9XaWNDR2ZARV3d6ZAVVvYmUtUk5wbmNIRnpDOE9GVXBEdnczelVmN2VfV3JrSlFuMkM1RDN4TkhQSU5uTUJqNkZAyNE55VQZDZD";

serve(async (req) => {
  const url = new URL(req.url);

  // 1. Meta Webhook Verification Handshake (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log(`[Webhook GET] mode=${mode}, token=${token}`);

    if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
      console.log("Meta Webhook verification succeeded!");
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    }

    console.warn("Meta Webhook verification failed. Token mismatch.");
    return new Response("Forbidden: Invalid verify token", { status: 403 });
  }

  // 2. Incoming Real-Time Events (Comments, Mentions, DMs) (POST)
  if (req.method === "POST") {
    try {
      const payload = await req.json();
      console.log("Received Instagram Event:", JSON.stringify(payload));

      // Handle comments and trigger automated DM replies
      if (payload.entry) {
        for (const entry of payload.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === "comments") {
                const comment = change.value;
                console.log(`New comment by ${comment.from?.username}: "${comment.text}" on media ${comment.media?.id}`);
              }
            }
          }
        }
      }

      // Always return 200 immediately to Meta
      return new Response("EVENT_RECEIVED", { status: 200 });
    } catch (err) {
      console.error("Error processing webhook payload:", err);
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
