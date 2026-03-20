require("dotenv").config({ path: ".env.local" });
const { query } = require("./lib/db");

(async () => {
  try {
    console.log("Checking society_status_enum values...");
    const r = await query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'society_status_enum'::regtype 
      ORDER BY enumsortorder
    `);
    console.log(
      "Society Status Enum Values:",
      r.rows.map((row) => row.enumlabel),
    );

    // Also check if there are any societies with SUSPENDED status
    const r2 = await query(`SELECT DISTINCT status FROM societies`);
    console.log(
      "Societies with Status:",
      r2.rows.map((row) => row.status),
    );

    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
