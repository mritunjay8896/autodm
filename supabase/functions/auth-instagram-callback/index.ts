import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const META_APP_ID = Deno.env.get("META_APP_ID") || "1097121733196692";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || "874fd11ffd94c7c6ca4853791977e4e3";
const REDIRECT_URI =
  Deno.env.get("REDIRECT_URI") ||
  "https://bcrxhujkttforhmotrkj.supabase.co/functions/v1/auth-instagram-callback";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://app.mridalini.com";

function renderErrorHtml(msg: string) {
  const safeMsg = msg.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Connection Notice</title>
  <style>
    body { background: #090d16; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
    .card { background: #131b2e; border: 1px solid #7f1d1d; padding: 32px; border-radius: 16px; max-width: 440px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: #7f1d1d; color: #fca5a5; font-weight: 600; font-size: 13px; padding: 4px 12px; border-radius: 9999px; margin-bottom: 16px; border: 1px solid #b91c1c; }
    h2 { margin: 0 0 10px; font-size: 18px; color: #f87171; }
    p { color: #94a3b8; font-size: 14px; margin: 0 0 20px; line-height: 1.5; }
    button { background: #334155; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Connection Notice</div>
    <h2>Could not link account</h2>
    <p>${safeMsg}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: "INSTAGRAM_AUTH_ERROR", error: ${JSON.stringify(msg)} }, "*");
    }
  </script>
</body>
</html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 200
    }
  );
}

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle Meta authorization cancellation or errors
  if (error || !code) {
    const errorMsg = errorDescription || error || "Instagram authorization was cancelled.";
    return renderErrorHtml(errorMsg);
  }

  try {
    let accessToken = "";
    let igUserId = "";
    let igUsername = "";
    let igAccountData: any = null;

    // -------------------------------------------------------------
    // ATTEMPT 1: Instagram Business Login Token Exchange
    // POST to https://api.instagram.com/oauth/access_token
    // -------------------------------------------------------------
    try {
      const igFormData = new FormData();
      igFormData.append("client_id", META_APP_ID);
      igFormData.append("client_secret", META_APP_SECRET);
      igFormData.append("grant_type", "authorization_code");
      igFormData.append("redirect_uri", REDIRECT_URI);
      igFormData.append("code", code);

      const igRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body: igFormData
      });

      const igData = await igRes.json();

      if (igData.access_token) {
        accessToken = igData.access_token;
        igUserId = String(igData.user_id || "");

        // Upgrade to long-lived 60-day token
        try {
          const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
            META_APP_SECRET
          )}&access_token=${encodeURIComponent(accessToken)}`;
          const longRes = await fetch(longLivedUrl);
          const longData = await longRes.json();
          if (longData.access_token) {
            accessToken = longData.access_token;
          }
        } catch (e) {}

        // Query Instagram user profile
        try {
          const profileUrl = `https://graph.instagram.com/v21.0/me?fields=id,username,account_type,name,profile_picture_url&access_token=${encodeURIComponent(
            accessToken
          )}`;
          const profileRes = await fetch(profileUrl);
          const profileData = await profileRes.json();
          if (profileData.username) {
            igUsername = profileData.username;
            igUserId = profileData.id || igUserId;
            igAccountData = {
              id: igUserId,
              username: igUsername,
              name: profileData.name || igUsername,
              accountType: profileData.account_type || 'BUSINESS',
              profilePictureUrl: profileData.profile_picture_url || '',
              accessToken: accessToken
            };
          }
        } catch (e) {}
      }
    } catch (igErr) {
      console.warn("Instagram OAuth attempt notice:", igErr);
    }

    // -------------------------------------------------------------
    // ATTEMPT 2: Facebook Graph API OAuth Token Exchange
    // -------------------------------------------------------------
    if (!accessToken) {
      const fbTokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
      fbTokenUrl.searchParams.set("client_id", META_APP_ID);
      fbTokenUrl.searchParams.set("client_secret", META_APP_SECRET);
      fbTokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      fbTokenUrl.searchParams.set("code", code);

      const fbRes = await fetch(fbTokenUrl.toString());
      const fbData = await fbRes.json();

      if (fbData.access_token) {
        accessToken = fbData.access_token;

        // Exchange for 60-day Long-Lived Token
        try {
          const longLivedUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
          longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
          longLivedUrl.searchParams.set("client_id", META_APP_ID);
          longLivedUrl.searchParams.set("client_secret", META_APP_SECRET);
          longLivedUrl.searchParams.set("fb_exchange_token", accessToken);

          const longRes = await fetch(longLivedUrl.toString());
          const longData = await longRes.json();
          if (longData.access_token) {
            accessToken = longData.access_token;
          }
        } catch (e) {}

        // Query Meta /me/accounts for Facebook Pages & Instagram Business Account
        const accountsUrl = new URL("https://graph.facebook.com/v19.0/me/accounts");
        accountsUrl.searchParams.set(
          "fields",
          "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}"
        );
        accountsUrl.searchParams.set("access_token", accessToken);

        const accountsRes = await fetch(accountsUrl.toString());
        const accountsData = await accountsRes.json();
        const pages = accountsData.data || [];

        for (const page of pages) {
          if (page.instagram_business_account?.id) {
            const ig = page.instagram_business_account;
            igUsername = ig.username || "";
            igUserId = ig.id || "";
            igAccountData = {
              id: igUserId,
              username: igUsername,
              name: ig.name || igUsername,
              accountType: "BUSINESS",
              profilePictureUrl: ig.profile_picture_url || "",
              accessToken: accessToken
            };
            break;
          }
        }
      }
    }

    if (!igUsername && !igUserId) {
      return renderErrorHtml(
        "No Instagram Business account was returned. Please ensure your Instagram account is set to Professional/Creator and linked in Meta."
      );
    }

    // Success response with postMessage for popup and fallback redirect
    const usernameFinal = igUsername || "instagram_user";
    const idFinal = igUserId || "connected";

    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Instagram Connected</title>
  <style>
    body { background: #090d16; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
    .card { background: #131b2e; border: 1px solid #1e293b; padding: 36px 32px; border-radius: 20px; box-shadow: 0 25px 50px rgba(0,0,0,0.6); max-width: 400px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: #064e3b; color: #34d399; font-weight: 600; font-size: 13px; padding: 6px 14px; border-radius: 9999px; margin-bottom: 18px; border: 1px solid #059669; }
    h2 { margin: 0 0 8px; font-size: 22px; color: #ffffff; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0 0 24px; }
    .spinner { width: 24px; height: 24px; border: 3px solid #334155; border-top-color: #f43f5e; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓ Connected Successfully</div>
    <h2>@${usernameFinal}</h2>
    <p>Your Instagram account has been authorized. Closing this window and updating your AutoDM dashboard...</p>
    <div class="spinner"></div>
  </div>
  <script>
    const payload = {
      type: "INSTAGRAM_AUTH_SUCCESS",
      connected: true,
      handle: ${JSON.stringify(usernameFinal)},
      id: ${JSON.stringify(idFinal)},
      account: ${JSON.stringify(igAccountData)}
    };
    if (window.opener) {
      try {
        window.opener.postMessage(payload, "*");
      } catch (e) {}
      setTimeout(function() { window.close(); }, 700);
    } else {
      window.location.href = "${FRONTEND_URL}?connected=true&handle=" + encodeURIComponent("${usernameFinal}") + "&id=" + encodeURIComponent("${idFinal}");
    }
  </script>
</body>
</html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, max-age=0"
        },
        status: 200
      }
    );
  } catch (err: any) {
    console.error("OAuth callback failure:", err.message);
    return renderErrorHtml(err.message || "Failed to complete Instagram authorization.");
  }
});
