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
    // Step A: Exchange code for Short-Lived Access Token
    const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", META_APP_ID);
    tokenUrl.searchParams.set("client_secret", META_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message || "Failed to obtain short-lived access token.");
    }

    // Step B: Exchange for 60-day Long-Lived Token
    const longLivedUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", META_APP_ID);
    longLivedUrl.searchParams.set("client_secret", META_APP_SECRET);
    longLivedUrl.searchParams.set("fb_exchange_token", tokenData.access_token);

    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedRes.json();
    const longLivedToken = longLivedData.access_token || tokenData.access_token;

    // Step C: Query Meta /me/accounts for Facebook Pages & Instagram Business Account
    const accountsUrl = new URL("https://graph.facebook.com/v19.0/me/accounts");
    accountsUrl.searchParams.set(
      "fields",
      "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}"
    );
    accountsUrl.searchParams.set("access_token", longLivedToken);

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

    // Step D: Redirect user back to frontend with success parameters
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
