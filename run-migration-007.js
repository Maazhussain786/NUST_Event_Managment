const { Pool } = require("pg");
require("dotenv").config({ path: ".env.local" });

const pool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || "5432"),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 10000,
});

(async () => {
  try {
    const client = await pool.connect();
    console.log(
      "Running migration 007 - adding SUSPENDED to society_status_enum...\n",
    );

    // Check current enum values
    const check1 = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'society_status_enum'::regtype 
      ORDER BY enumsortorder
    `);
    console.log(
      "BEFORE - Society Status Enum Values:",
      check1.rows.map((row) => row.enumlabel),
    );

    // Run migration 007
    const migration = `
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'society_status_enum'::regtype
          AND enumlabel = 'SUSPENDED'
    ) THEN
        ALTER TYPE society_status_enum ADD VALUE 'SUSPENDED';
        RAISE NOTICE 'Added SUSPENDED to society_status_enum';
    ELSE
        RAISE NOTICE 'SUSPENDED already exists in society_status_enum';
    END IF;
END $$;
    `;

    await client.query(migration);
    console.log("\n✅ Migration executed successfully");

    // Check enum values after migration
    const check2 = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'society_status_enum'::regtype 
      ORDER BY enumsortorder
    `);
    console.log(
      "AFTER - Society Status Enum Values:",
      check2.rows.map((row) => row.enumlabel),
    );

    client.release();
    process.exit(0);
  } catch (e) {
    console.error("❌ Error:", e.message);
    process.exit(1);
  }
})();
