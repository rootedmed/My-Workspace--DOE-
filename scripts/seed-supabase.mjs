import crypto from "node:crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const base = `${url.replace(/\/$/, "")}/rest/v1`;

function headers(prefer) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase error ${response.status}: ${body}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

const demoUsers = [
  { email: "maya@example.com", first_name: "Maya", password: "demo-password" },
  { email: "ryan@example.com", first_name: "Ryan", password: "demo-password" }
];

for (const user of demoUsers) {
  const salt = crypto.randomBytes(16).toString("hex");
  const payload = {
    email: user.email,
    first_name: user.first_name,
    salt,
    password_hash: hashPassword(user.password, salt)
  };
  await request("/app_users?on_conflict=email", {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify([payload])
  });
}

const users = await request("/app_users?select=id,email,first_name");

for (const user of users) {
  await request("/onboarding_profiles?on_conflict=user_id", {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify([
      {
        user_id: user.id,
        first_name: user.first_name,
        age_range: "31_37",
        location_preference: "same_city",
        intent: {
          lookingFor: "marriage_minded",
          timelineMonths: 18,
          readiness: 4,
          weeklyCapacity: 2
        },
        tendencies: {
          attachmentAnxiety: 45,
          attachmentAvoidance: 35,
          conflictRepair: 70,
          emotionalRegulation: 68,
          noveltyPreference: 55
        },
        personality: {
          openness: 62,
          conscientiousness: 71,
          extraversion: 52,
          agreeableness: 77,
          emotionalStability: 65
        }
      }
    ])
  });
}

const [maya] = users.filter((u) => u.email === "maya@example.com");
if (maya) {
  await request("/match_results", {
    method: "POST",
    headers: headers("return=minimal"),
    body: JSON.stringify([
      {
        user_id: maya.id,
        candidate_id: "seed-ava",
        candidate_first_name: "Ava",
        total_score: 88,
        hard_filter_pass: true,
        reasons: [],
        top_fit_reasons: [
          "Shared commitment direction (92/100)",
          "Conflict and regulation alignment (86/100)",
          "Lifestyle feasibility (84/100)"
        ],
        potential_friction_points: [
          "Novelty/stability rhythm may need explicit conversation (62/100)",
          "Personality fit may need explicit conversation (68/100)"
        ],
        conversation_prompts: [
          "How much novelty versus routine helps each of us feel engaged?",
          "Where do our defaults differ, and how can we support each other?"
        ],
        component_scores: {
          intent: 92,
          lifestyle: 84,
          attachment: 82,
          conflictRegulation: 86,
          personality: 68,
          novelty: 62
        }
      }
    ])
  });
}

console.log("Supabase demo data seeded.");
