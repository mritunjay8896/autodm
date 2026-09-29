import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const META_APP_ID = Deno.env.get("META_APP_ID") || "1097121733196692";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || "874fd11ffd94c7c6ca4853791977e4e3";
const REDIRECT_URI =
  Deno.env.get("REDIRECT_URI") ||
  "https://bcrxhujkttforhmotrkj.supabase.co/functions/v1/auth-instagram-callback";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://app.mridalini.com";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle Meta authorization cancellation or errors
  if (error || !code) {
    console.error("Meta OAuth Error:", error, errorDescription);
    const redirectUrl = `${FRONTEND_URL}?error=${encodeURIComponent(
      errorDescription || error || "Instagram authorization was cancelled."
    )}`;
    return Response.redirect(redirectUrl, 302);
  }

  try {
    let accessToken = "";
    let igUserId = "";
    let igUsername = "";

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
      console.log("Instagram OAuth response:", JSON.stringify(igData));

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
        } catch (e) {
          console.warn("Long-lived token upgrade notice:", e);
        }

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
          }
        } catch (e) {
          console.warn("Profile query notice:", e);
        }

        const redirectUrl = `${FRONTEND_URL}?connected=true&handle=${encodeURIComponent(
          igUsername || "instagram_user"
        )}&id=${encodeURIComponent(igUserId)}`;
        return Response.redirect(redirectUrl, 302);
      }
    } catch (igErr) {
      console.warn("Instagram OAuth attempt notice:", igErr);
    }

    // -------------------------------------------------------------
    // ATTEMPT 2: Facebook Graph API OAuth Token Exchange
    // GET https://graph.facebook.com/v19.0/oauth/access_token
    // -------------------------------------------------------------
    const fbTokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    fbTokenUrl.searchParams.set("client_id", META_APP_ID);
    fbTokenUrl.searchParams.set("client_secret", META_APP_SECRET);
    fbTokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    fbTokenUrl.searchParams.set("code", code);

    const fbRes = await fetch(fbTokenUrl.toString());
    const fbData = await fbRes.json();

    if (!fbData.access_token) {
      throw new Error(fbData.error?.message || "Failed to exchange authorization code for access token.");
    }

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

    let igAccount: any = null;
    for (const page of pages) {
      if (page.instagram_business_account?.id) {
        igAccount = page.instagram_business_account;
        break;
      }
    }

    if (!igAccount) {
      const redirectUrl = `${FRONTEND_URL}?error=${encodeURIComponent(
        "No Instagram Business account linked to your Facebook Pages. Please link your Instagram account to a Facebook Page."
      )}`;
      return Response.redirect(redirectUrl, 302);
    }

    const redirectUrl = `${FRONTEND_URL}?connected=true&handle=${encodeURIComponent(
      igAccount.username || ""
    )}&id=${encodeURIComponent(igAccount.id)}`;

    return Response.redirect(redirectUrl, 302);
  } catch (err: any) {
    console.error("OAuth callback failure:", err.message);
    const redirectUrl = `${FRONTEND_URL}?error=${encodeURIComponent(err.message)}`;
    return Response.redirect(redirectUrl, 302);
  }
});
