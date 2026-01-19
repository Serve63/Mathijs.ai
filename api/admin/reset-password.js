// TIJDELIJK ENDPOINT - VERWIJDER NA GEBRUIK
// Reset password for a specific user via Supabase Admin API

const { json } = require("../_lib/security");
const { SUPABASE_URL } = require("../_lib/supabase");

const TARGET_EMAIL = "servec321@gmail.com";
const NEW_PASSWORD = "hallo12345"; // minimum 10 chars for Supabase

module.exports = async (req, res) => {
  try {
    const { getSupabaseServiceRoleKey } = require("../_lib/env");
    const serviceRoleKey = getSupabaseServiceRoleKey();
    
    if (!serviceRoleKey) {
      return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    }

    // Find user by email
    const listResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!listResp.ok) {
      const text = await listResp.text();
      return json(res, 500, { error: `Failed to list users: ${listResp.status} - ${text.slice(0, 200)}` });
    }

    const listData = await listResp.json();
    const users = listData?.users || [];
    const targetUser = users.find(u => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase());

    if (!targetUser) {
      // User doesn't exist, create them
      const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: TARGET_EMAIL,
          password: NEW_PASSWORD,
          email_confirm: true,
          app_metadata: { plan: "lifetime", lifetime_free: true },
        }),
      });

      if (!createResp.ok) {
        const text = await createResp.text();
        return json(res, 500, { error: `Failed to create user: ${createResp.status} - ${text.slice(0, 200)}` });
      }

      return json(res, 200, { 
        ok: true, 
        message: `User ${TARGET_EMAIL} created with password: ${NEW_PASSWORD}`,
        created: true 
      });
    }

    // User exists, update password
    const updateResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetUser.id}`, {
      method: "PUT",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password: NEW_PASSWORD,
      }),
    });

    if (!updateResp.ok) {
      const text = await updateResp.text();
      return json(res, 500, { error: `Failed to update password: ${updateResp.status} - ${text.slice(0, 200)}` });
    }

    return json(res, 200, { 
      ok: true, 
      message: `Password reset for ${TARGET_EMAIL}. New password: ${NEW_PASSWORD}`,
      updated: true
    });

  } catch (e) {
    return json(res, 500, { error: String(e?.message || e).slice(0, 200) });
  }
};

