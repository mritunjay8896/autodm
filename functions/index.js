const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// Real Meta App Credentials
const META_APP_ID = process.env.META_APP_ID || "1097121733196692";
const META_APP_SECRET = process.env.META_APP_SECRET || "874fd11ffd94c7c6ca4853791977e4e3";
const WEBHOOK_VERIFY_TOKEN =
  process.env.WEBHOOK_VERIFY_TOKEN ||
  "IGAAPl048uu5RBZAGE3WEZAEVXdUTVNyeXdULVh1YUZAIRGo2aXlMbG1fY0FuMHl1OFZAxdTBmN2lQVkVfeF9XaWNDR2ZARV3d6ZAVVvYmUtUk5wbmNIRnpDOE9GVXBEdnczelVmN2VfV3JrSlFuMkM1RDN4TkhQSU5uTUJqNkZAyNE55VQZDZD";

// Cloud Function Callback URL registered in Meta App Dashboard
const REDIRECT_URI =
  process.env.REDIRECT_URI ||
  "https://us-central1-autodm-mridalini.cloudfunctions.net/authInstagramCallback";

// Target frontend URL (GitHub Pages / custom domain)
const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.mridalini.com";

/**
 * Meta OAuth Callback Handler for Instagram Business Connection
 * v2 HTTPS Cloud Function: authInstagramCallback
 */
exports.authInstagramCallback = onRequest({ cors: true }, async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // 1. Handle user cancellation or Meta authorization errors
  if (error || !code) {
    console.error("Meta OAuth Authorization Error:", error, error_description);
    return res.redirect(
      `${FRONTEND_URL}?error=${encodeURIComponent(
        error_description || error || "Instagram authorization was cancelled."
      )}`
    );
  }

  // 2. Validate user state (Firebase UID passed from client)
  const userId = state;
  if (!userId) {
    console.error("Missing state parameter (Firebase UID).");
    return res.redirect(
      `${FRONTEND_URL}?error=${encodeURIComponent("Authentication state verification failed. Missing user ID.")}`
    );
  }

  try {
    // -------------------------------------------------------------------------
    // Step A: Exchange temporary authorization code for Short-Lived User Access Token
    // -------------------------------------------------------------------------
    console.log("Step A: Exchanging code for short-lived access token...");
    const shortLivedTokenResponse = await axios.get(
      "https://graph.facebook.com/v19.0/oauth/access_token",
      {
        params: {
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          redirect_uri: REDIRECT_URI,
          code: code
        }
      }
    );

    const shortLivedToken = shortLivedTokenResponse.data?.access_token;
    if (!shortLivedToken) {
      throw new Error("Meta API did not return an access token for the provided code.");
    }

    // -------------------------------------------------------------------------
    // Step B: Immediately exchange for Long-Lived (60-day) User Access Token
    // -------------------------------------------------------------------------
    console.log("Step B: Exchanging short-lived token for 60-day long-lived token...");
    const longLivedTokenResponse = await axios.get(
      "https://graph.facebook.com/v19.0/oauth/access_token",
      {
        params: {
          grant_type: "fb_exchange_token",
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          fb_exchange_token: shortLivedToken
        }
      }
    );

    const longLivedToken = longLivedTokenResponse.data?.access_token;
    if (!longLivedToken) {
      throw new Error("Failed to generate long-lived Meta access token.");
    }

    // -------------------------------------------------------------------------
    // Step C: Query Meta's /me/accounts endpoint to extract Facebook Pages and
    // find the attached instagram_business_account object
    // -------------------------------------------------------------------------
    console.log("Step C: Fetching Facebook Pages and attached Instagram Business Account...");
    const accountsResponse = await axios.get(
      "https://graph.facebook.com/v19.0/me/accounts",
      {
        params: {
          fields: "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}",
          access_token: longLivedToken
        }
      }
    );

    const pages = accountsResponse.data?.data || [];
    if (pages.length === 0) {
      console.warn("User has no Facebook Pages linked to this Meta account.");
      return res.redirect(
        `${FRONTEND_URL}?error=${encodeURIComponent(
          "No Facebook Pages found. To use Instagram Graph API, your Instagram Business account must be linked to a Facebook Page."
        )}`
      );
    }

    // Iterate through pages to identify the attached Instagram Business Account
    let targetIgAccount = null;

    for (const page of pages) {
      if (page.instagram_business_account && page.instagram_business_account.id) {
        targetIgAccount = page.instagram_business_account;
        break;
      }
    }

    // Gracefully handle personal accounts or pages without a linked IG Business Account
    if (!targetIgAccount) {
      console.warn("User logged in with an account that has no Instagram Business profile attached.");
      return res.redirect(
        `${FRONTEND_URL}?error=${encodeURIComponent(
          "No Instagram Business account found! Please make sure your Instagram account is switched to a Professional/Business account and linked to a Facebook Page."
        )}`
      );
    }

    const instagramAccountId = targetIgAccount.id;
    const handle = targetIgAccount.username || "";
    const avatarUrl = targetIgAccount.profile_picture_url || "";

    // -------------------------------------------------------------------------
    // Step D: Write data directly to Cloud Firestore: /instagram_accounts/{instagramAccountId}
    // -------------------------------------------------------------------------
    console.log(`Step D: Saving Instagram Business account @${handle} (${instagramAccountId}) to Firestore...`);
    
    const accountPayload = {
      userId: userId,
      instagramAccountId: instagramAccountId,
      handle: handle,
      avatarUrl: avatarUrl,
      accessToken: longLivedToken,
      status: "Active",
      updatedAt: new Date().toISOString()
    };

    await db
      .collection("instagram_accounts")
      .doc(instagramAccountId)
      .set(accountPayload, { merge: true });

    // Also link reference under user document for instant UI lookups
    await db
      .collection("users")
      .doc(userId)
      .set(
        {
          instagramAccountId: instagramAccountId,
          instagramHandle: handle,
          instagramAvatar: avatarUrl,
          instagramConnected: true,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );

    console.log("Account successfully synced. Redirecting to GitHub Pages...");

    // -------------------------------------------------------------------------
    // Securely redirect user's browser back to main GitHub Pages landing URL
    // -------------------------------------------------------------------------
    return res.redirect(
      `${FRONTEND_URL}?connected=true&handle=${encodeURIComponent(
        handle
      )}&id=${encodeURIComponent(instagramAccountId)}`
    );
  } catch (err) {
    const errorDetails = err.response?.data?.error?.message || err.message || "An unexpected error occurred.";
    console.error("Fatal error during authInstagramCallback:", errorDetails);
    
    return res.redirect(
      `${FRONTEND_URL}?error=${encodeURIComponent(`Instagram connection failed: ${errorDetails}`)}`
    );
  }
});

/**
 * Meta Webhook Verification and Event Handler
 * v2 HTTPS Cloud Function: instagramWebhook
 */
exports.instagramWebhook = onRequest({ cors: true }, async (req, res) => {
  // 1. Meta Webhook Verification Challenge (GET)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
      console.log("Meta Webhook verification succeeded.");
      return res.status(200).send(challenge);
    } else {
      console.warn("Meta Webhook verification failed. Invalid verify token.");
      return res.sendStatus(403);
    }
  }

  // 2. Real-time Instagram Events (Comments, Mentions, Messages) (POST)
  if (req.method === "POST") {
    try {
      const data = req.body;
      console.log("Received Instagram Webhook Event:", JSON.stringify(data));

      // Persist event in Firestore for real-time monitoring and trigger execution
      await db.collection("webhook_events").add({
        payload: data,
        receivedAt: new Date().toISOString()
      });

      return res.status(200).send("EVENT_RECEIVED");
    } catch (err) {
      console.error("Error logging webhook event:", err);
      return res.status(200).send("EVENT_RECEIVED");
    }
  }

  return res.sendStatus(405);
});
