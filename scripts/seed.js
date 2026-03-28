/**
 * Seed Script - Populates Azure PostgreSQL with sample NUST data.
 * Run: node scripts/seed.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || '5432'),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function seed() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting seed...\n');
    await client.query('BEGIN');

    // 1. Create super admins
    console.log('👤 Creating super admins...');
    const superAdmins = [
      { name: 'Maaz Hussain', email: 'maazhussain972@gmail.com', password: 'maaz@123' },
      { name: 'Muhammad Abdul Daym', email: 'abduldaym786@gmail.com', password: 'daym@123' },
      { name: 'Muhammad Bilal Atif', email: 'bilalatif23@gmail.com', password: 'bilal@123' },
    ];
    const superAdminIds = [];
    for (const admin of superAdmins) {
      const adminHash = await bcrypt.hash(admin.password, 12);
      const adminResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, user_type, status)
         VALUES ($1, $2, $3, 'SUPER_ADMIN', 'ACTIVE')
         ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               full_name = EXCLUDED.full_name,
               user_type = 'SUPER_ADMIN',
               status = 'ACTIVE'
         RETURNING id`,
        [admin.email.toLowerCase(), adminHash, admin.name]
      );
      superAdminIds.push(adminResult.rows[0].id);
      console.log(`  ✓ Super Admin: ${admin.email.toLowerCase()}`);
    }
    const adminId = superAdminIds[0];

    // 2. Create sample students
    console.log('\n👥 Creating sample students...');
    const studentHash = await bcrypt.hash('test1234', 12);
    const students = [
      { email: 'student1@seecs.edu.pk', name: 'Ali Ahmed' },
      { email: 'student2@smme.edu.pk', name: 'Sara Khan' },
      { email: 'student3@nice.edu.pk', name: 'Hassan Raza' },
    ];
    const studentIds = [];
    for (const s of students) {
      const res = await client.query(
        `INSERT INTO users (email, password_hash, full_name, user_type, status)
         VALUES ($1, $2, $3, 'STUDENT', 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET status = 'ACTIVE'
         RETURNING id`,
        [s.email, studentHash, s.name]
      );
      studentIds.push(res.rows[0].id);
      console.log(`  ✓ ${s.name} (${s.email})`);
    }

    // 3. Get school IDs
    const schoolsResult = await client.query('SELECT id, abbreviation FROM nust_schools');
    const schools = {};
    schoolsResult.rows.forEach(s => { schools[s.abbreviation] = s.id; });
    console.log(`\n🏫 Found ${Object.keys(schools).length} schools`);

    // 4. Create societies
    console.log('\n🏛️ Creating societies...');
    const societies = [
      { name: 'NUST Developers Society', desc: 'A community of passionate developers building the future. Hackathons, bootcamps, and tech talks.', school: null, nustWide: true },
      { name: 'SEECS Robotics Society', desc: 'Building robots and autonomous systems. Line followers to drones.', school: 'SEECS', nustWide: false },
      { name: 'Literary Society NUST', desc: 'Poetry nights, debates, creative writing workshops, and the annual NUST Literary Festival.', school: null, nustWide: true },
      { name: 'NUST Sports Society', desc: 'Cricket, football, basketball, and indoor games tournaments across all campuses.', school: null, nustWide: true },
      { name: 'SMME Photography Club', desc: 'Photography walks, editing workshops, and exhibitions.', school: 'SMME', nustWide: false },
      { name: 'NUST Music Society', desc: 'Battle of Bands, open mic nights, and jam sessions for musicians across NUST.', school: null, nustWide: true },
      { name: 'ACM SEECS Chapter', desc: 'Competitive programming, algorithmic challenges, and ICPC preparation.', school: 'SEECS', nustWide: false },
      { name: 'NUST Entrepreneurship Club', desc: 'Pitch competitions, mentorship programs, and startup weekends.', school: null, nustWide: true },
    ];
    const societyIds = [];
    for (const soc of societies) {
      const schoolId = soc.school ? schools[soc.school] : null;
      const res = await client.query(
        `INSERT INTO societies (name, description, status, school_id, is_nust_wide, created_by)
         VALUES ($1, $2, 'APPROVED', $3, $4, $5)
         ON CONFLICT DO NOTHING RETURNING id`,
        [soc.name, soc.desc, schoolId, soc.nustWide, adminId]
      );
      if (res.rows.length > 0) {
        societyIds.push(res.rows[0].id);
        console.log(`  ✓ ${soc.name}`);
      }
    }

    // 5. Get category IDs
    const catResult = await client.query('SELECT id, name FROM event_categories');
    const categories = {};
    catResult.rows.forEach(c => { categories[c.name.toLowerCase()] = c.id; });

    // 6. Create events
    console.log('\n📅 Creating events...');
    const now = new Date();
    const events = [
      { title: 'HackNUST 2025', desc: '48-hr hackathon. Teams of 3-5. Prizes worth Rs. 500K.', location: 'SEECS Auditorium, H-12', price: 500, max: 200, category: 'technology', si: 0, days: 7, h: 10, dur: 48 },
      { title: 'Poetry Night: Ghazal Edition', desc: 'Urdu poetry evening. Renowned poets + students. Chai included.', location: 'NICE Library Hall', price: 0, max: 100, category: 'arts', si: 2, days: 3, h: 18, dur: 3 },
      { title: 'AI/ML Workshop Series', desc: 'ML with Python. NumPy, Pandas, scikit-learn. Bring laptops!', location: 'SEECS Lab 4, H-12', price: 200, max: 50, category: 'workshop', si: 0, days: 5, h: 14, dur: 3 },
      { title: 'NUST Premier League S4', desc: 'Inter-school cricket tournament. 11 schools. Round of 16!', location: 'NUST Cricket Ground', price: 0, max: 500, category: 'sports', si: 3, days: 2, h: 9, dur: 8 },
      { title: 'Startup Pitch Competition', desc: 'Pitch to investors. Win seed funding up to Rs. 200K.', location: 'NBS Seminar Hall', price: 300, max: 80, category: 'competition', si: 7, days: 10, h: 13, dur: 5 },
      { title: 'Battle of Bands 2025', desc: 'Annual music showdown. All schools. Crowd voting + celebrity judges.', location: 'NUST Amphitheatre', price: 400, max: 1000, category: 'music', si: 5, days: 14, h: 17, dur: 5 },
      { title: 'RoboWars Championship', desc: 'Combat robots in the arena! Multiple weight categories.', location: 'SEECS Ground Floor', price: 1000, max: 30, category: 'competition', si: 1, days: 12, h: 10, dur: 8 },
      { title: 'NUST Through the Lens', desc: 'Photo exhibition. 100+ photos by students. Open to all.', location: 'SMME Art Gallery', price: 0, max: 200, category: 'cultural', si: 4, days: 1, h: 11, dur: 6 },
      { title: 'ICPC Practice Contest', desc: 'Online CP contest. 5 hours, 10 problems.', location: 'Online (Codeforces)', price: 0, max: 500, category: 'academic', si: 6, days: 4, h: 10, dur: 5 },
      { title: 'Cultural Night', desc: 'Colours of Pakistan. Traditional dances, music, food.', location: 'Convention Center', price: 200, max: 800, category: 'cultural', si: 5, days: 20, h: 16, dur: 5 },
    ];
    for (const evt of events) {
      const socId = societyIds[evt.si];
      if (!socId) continue;
      const start = new Date(now); start.setDate(start.getDate() + evt.days); start.setHours(evt.h, 0, 0, 0);
      const end = new Date(start); end.setHours(end.getHours() + evt.dur);
      const regEnd = new Date(start); regEnd.setDate(regEnd.getDate() - 1);
      const catId = categories[evt.category] || null;
      await client.query(
        `INSERT INTO events (title, description, society_id, location, is_paid, ticket_price, max_tickets,
         event_start, event_end, registration_end, category_id, is_cancelled, created_by, banner_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE, $12, NULL)
         ON CONFLICT DO NOTHING`,
        [evt.title, evt.desc, socId, evt.location, evt.price > 0, evt.price, evt.max, start, end, regEnd, catId, adminId]
      );
      console.log(`  ✓ ${evt.title}`);
    }

    // 7. Create roles for each society, then memberships
    console.log('\n🔑 Creating society roles...');
    const roleIds = {};
    const presidentRoleIds = {};
    for (const socId of societyIds) {
      // Member role
      const roleRes = await client.query(
        `INSERT INTO roles (society_id, name, description, hierarchy_level, is_system_role)
         VALUES ($1, 'Member', 'General member', 1, TRUE)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [socId]
      );
      if (roleRes.rows.length > 0) {
        roleIds[socId] = roleRes.rows[0].id;
      } else {
        const existing = await client.query(`SELECT id FROM roles WHERE society_id = $1 AND name = 'Member' LIMIT 1`, [socId]);
        if (existing.rows.length > 0) roleIds[socId] = existing.rows[0].id;
      }

      // President role
      const presRes = await client.query(
        `INSERT INTO roles (society_id, name, description, hierarchy_level, is_system_role)
         VALUES ($1, 'President', 'Society President — full control', 10, TRUE)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [socId]
      );
      if (presRes.rows.length > 0) {
        presidentRoleIds[socId] = presRes.rows[0].id;
      } else {
        const existing = await client.query(`SELECT id FROM roles WHERE society_id = $1 AND name = 'President' LIMIT 1`, [socId]);
        if (existing.rows.length > 0) presidentRoleIds[socId] = existing.rows[0].id;
      }

      // VP role
      await client.query(
        `INSERT INTO roles (society_id, name, description, hierarchy_level, is_system_role)
         VALUES ($1, 'Vice President', 'Society Vice President', 8, TRUE)
         ON CONFLICT DO NOTHING`,
        [socId]
      );
    }
    console.log(`  ✓ Created roles for ${Object.keys(roleIds).length} societies (Member + President + VP)`);

    // Assign privileges to President role
    console.log('\n🛡️ Assigning privileges to President roles...');
    const privResult = await client.query('SELECT id FROM privileges');
    for (const socId of societyIds) {
      const presRoleId = presidentRoleIds[socId];
      if (presRoleId) {
        for (const priv of privResult.rows) {
          await client.query(
            `INSERT INTO role_privileges (role_id, privilege_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [presRoleId, priv.id]
          );
        }
      }
    }
    console.log('  ✓ All privileges assigned to President roles');

    // Create president user
    console.log('\n👑 Creating president user...');
    const presHash = await bcrypt.hash('president123', 12);
    const presResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name, user_type, status)
       VALUES ($1, $2, $3, 'STUDENT', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'ACTIVE'
       RETURNING id`,
      ['president.devs@seecs.edu.pk', presHash, 'Bilal Ahmad']
    );
    const presidentId = presResult.rows[0].id;
    console.log('  ✓ president.devs@seecs.edu.pk');

    console.log('\n🤝 Creating memberships...');
    for (let i = 0; i < Math.min(studentIds.length, societyIds.length); i++) {
      const socId = societyIds[i];
      if (roleIds[socId]) {
        await client.query(`INSERT INTO society_memberships (user_id, society_id, role_id, is_active) VALUES ($1, $2, $3, TRUE) ON CONFLICT DO NOTHING`, [studentIds[i], socId, roleIds[socId]]);
      }
    }
    // President membership in first society (NUST Developers)
    if (societyIds[0] && presidentRoleIds[societyIds[0]]) {
      await client.query(
        `INSERT INTO society_memberships (user_id, society_id, role_id, is_active) VALUES ($1, $2, $3, TRUE) ON CONFLICT DO NOTHING`,
        [presidentId, societyIds[0], presidentRoleIds[societyIds[0]]]
      );
      console.log('  ✓ Bilal Ahmad → President of NUST Developers Society');
    }
    for (const socId of societyIds) {
      if (roleIds[socId]) {
        await client.query(`INSERT INTO society_memberships (user_id, society_id, role_id, is_active) VALUES ($1, $2, $3, TRUE) ON CONFLICT DO NOTHING`, [adminId, socId, roleIds[socId]]);
      }
    }
    console.log('  ✓ Done');

    await client.query('COMMIT');
    console.log('\n✅ Seed completed!\n');
    console.log('📧 Super Admin: maazhussain972@gmail.com / maaz@123');
    console.log('📧 Super Admin: abduldaym786@gmail.com / daym@123');
    console.log('📧 Super Admin: bilalatif23@gmail.com / bilal@123');
    console.log('📧 Student: student1@seecs.edu.pk / test1234');
    console.log('📧 President: president.devs@seecs.edu.pk / president123');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
