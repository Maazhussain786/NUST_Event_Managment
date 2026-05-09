require("dotenv").config({ path: ".env.local" });

const { createClient } = require("redis");
const { Pool } = require("pg");
const { MongoClient } = require("mongodb");

const redisUrl = process.env.REDIS_URL;
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || "event_management";

async function clearCacheKeys(redis) {
  const keys = [];
  for await (const key of redis.scanIterator({ MATCH: "cache:*", COUNT: 100 })) {
    keys.push(key);
  }

  if (keys.length > 0) {
    await redis.del(keys);
  }

  return keys.length;
}

async function warmTrending(redis, pg) {
  const result = await pg.query(
    `SELECT e.id, e.title, e.description, e.banner_url, e.location,
            e.event_start, e.event_end, e.ticket_price, e.max_tickets, e.is_paid,
            ec.name AS category_name,
            s.id AS society_id, s.name AS society_name, s.logo_url AS society_logo,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
     FROM events e
     LEFT JOIN event_categories ec ON e.category_id = ec.id
     JOIN societies s ON e.society_id = s.id
     LEFT JOIN tickets t ON e.id = t.event_id
     WHERE e.is_cancelled = FALSE AND e.deleted_at IS NULL AND e.event_end >= NOW()
     GROUP BY e.id, ec.name, s.id
     ORDER BY tickets_sold DESC, e.event_start ASC
     LIMIT 10`,
  );

  await redis.set("cache:events:trending", JSON.stringify({ events: result.rows }), {
    EX: 180,
  });
}

async function warmDefaultEventsList(redis, pg) {
  const result = await pg.query(
    `SELECT e.id, e.title, e.description, e.banner_url, e.location,
            e.event_start, e.event_end, e.registration_end, e.ticket_price, e.max_tickets, e.is_paid,
            e.category_id, ec.name AS category_name,
            s.id AS society_id, s.name AS society_name, s.logo_url AS society_logo,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
     FROM events e
     LEFT JOIN event_categories ec ON e.category_id = ec.id
     JOIN societies s ON e.society_id = s.id
     LEFT JOIN tickets t ON e.id = t.event_id
     WHERE e.is_cancelled = FALSE AND e.deleted_at IS NULL
     GROUP BY e.id, ec.name, s.id
     ORDER BY e.event_start ASC
     LIMIT 20 OFFSET 0`,
  );

  await redis.set("cache:events:list::::20:0", JSON.stringify({ events: result.rows }), {
    EX: 120,
  });
}

async function warmSocietyPublic(redis, mongoDb) {
  const docs = await mongoDb
    .collection("society_public_read")
    .find({}, { projection: { _id: 1 } })
    .limit(3)
    .toArray();

  for (const { _id } of docs) {
    const fullDoc = await mongoDb.collection("society_public_read").findOne({ _id });
    if (!fullDoc) continue;
    await redis.set(`cache:society:public:${_id}`, JSON.stringify(fullDoc), { EX: 300 });
  }

  return docs.length;
}

async function main() {
  if (!redisUrl) {
    throw new Error("REDIS_URL is missing in .env.local/.env");
  }

  const redis = createClient({ url: redisUrl });
  const pg = new Pool({
    host: process.env.AZURE_DB_HOST,
    port: parseInt(process.env.AZURE_DB_PORT || "5432", 10),
    database: process.env.AZURE_DB_NAME,
    user: process.env.AZURE_DB_USER,
    password: process.env.AZURE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  let mongoClient;
  try {
    await redis.connect();
    const removed = await clearCacheKeys(redis);

    await warmTrending(redis, pg);
    await warmDefaultEventsList(redis, pg);

    let warmedSocieties = 0;
    if (mongoUri) {
      mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });
      await mongoClient.connect();
      warmedSocieties = await warmSocietyPublic(redis, mongoClient.db(mongoDbName));
    }

    console.log(`Redis cache keys removed: ${removed}`);
    console.log("Warmed: cache:events:trending");
    console.log("Warmed: cache:events:list::::20:0");
    console.log(`Warmed society public keys: ${warmedSocieties}`);
  } finally {
    await pg.end();
    if (mongoClient) await mongoClient.close();
    if (redis.isOpen) await redis.quit();
  }
}

main().catch((error) => {
  console.error("Redis cache reset/warm failed:", error.message);
  process.exit(1);
});
