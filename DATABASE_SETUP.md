# Database Setup Guide

Complete guide for setting up the PostgreSQL database for the NUST Event Management System.

---

## Prerequisites

- **PostgreSQL 14+** (Azure PostgreSQL or local instance)
- **Node.js 18+** with npm
- **Git** for cloning the repository

---

## Option 1: Using Existing Azure Database (Team Members)

### Step 1: Get Database Credentials

Contact the project admin (Maaz Hussain) to get access credentials for the shared Azure PostgreSQL instance:

- **Host**: `eventmgmt-pg-server.postgres.database.azure.com`
- **Database**: `event_management`
- **User**: `pgadmin`
- **Password**: `[Request from admin]`
- **Port**: `5432`
- **SSL**: Required

### Step 2: Environment Configuration

1. Clone the repository:
   ```bash
   git clone https://github.com/Maazhussain786/NUST_Event_Managment.git
   cd NUST_Event_Managment
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` file in the root directory:
   ```env
   # Azure PostgreSQL Connection
   AZURE_DB_HOST=eventmgmt-pg-server.postgres.database.azure.com
   AZURE_DB_PORT=5432
   AZURE_DB_NAME=event_management
   AZURE_DB_USER=pgadmin
   AZURE_DB_PASSWORD=[Password from admin]

   # Authentication
   JWT_SECRET=nust-event-mgmt-secret-2026

   # Next.js
   NODE_ENV=development
   ```

### Step 3: Verify Connection

Test your database connection:

```bash
node -e "const {Pool}=require('pg');const p=new Pool({host:process.env.AZURE_DB_HOST,database:process.env.AZURE_DB_NAME,user:process.env.AZURE_DB_USER,password:process.env.AZURE_DB_PASSWORD,port:5432,ssl:{rejectUnauthorized:false}});p.query('SELECT NOW()').then(r=>{console.log('✅ Connected:',r.rows[0].now);p.end()}).catch(e=>{console.error('❌ Error:',e.message);p.end()})"
```

### Step 4: Start Development

```bash
npm run dev
```

The database schema is already set up on the Azure instance, so you can start developing immediately!

---

## Option 2: Setting Up Your Own Database

### Step 1: Create PostgreSQL Database

#### Local PostgreSQL:
```bash
createdb event_management
```

#### Azure PostgreSQL:
1. Create an Azure Database for PostgreSQL server
2. Create database named `event_management`
3. Configure firewall rules to allow your IP
4. Enable SSL connection

### Step 2: Environment Configuration

Create `.env.local`:
```env
# Your Database Connection
AZURE_DB_HOST=localhost  # or your Azure host
AZURE_DB_PORT=5432
AZURE_DB_NAME=event_management
AZURE_DB_USER=postgres  # or your username
AZURE_DB_PASSWORD=your_password

# Authentication
JWT_SECRET=nust-event-mgmt-secret-2026

# Next.js
NODE_ENV=development
```

### Step 3: Install PostgreSQL Extensions

Connect to your database and run:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### Step 4: Create Database Schema

Run the schema files in order:

```bash
# 1. Main schema (creates all tables, types, constraints)
psql -h localhost -U postgres -d event_management -f schema.sql

# 2. NUST-specific additions (schools, categories)
psql -h localhost -U postgres -d event_management -f schema-nust-additions.sql

# 3. Schema fixes (recent updates)
psql -h localhost -U postgres -d event_management -f schema-fixes.sql
```

### Step 5: Run Migrations

Run role hierarchy migration:
```bash
node scripts/migrate-roles.js
```

Add events status column (if not present):
```bash
node scripts/add-event-status.js
```

### Step 6: Seed Sample Data

Populate database with sample data:
```bash
node scripts/seed.js
```

This creates:
- **Admin account**: `mhussain.bscs24seecs@seecs.edu.pk` / `Mobile 786`
- **Student account**: `student1@seecs.edu.pk` / `test1234`
- 11 NUST schools
- 24 sample societies with roles
- 30 sample events
- Sample categories, wings, portfolios

### Step 7: Verify Setup

Check table count:
```bash
node -e "const {Pool}=require('pg');require('dotenv').config({path:'.env.local'});const p=new Pool({host:process.env.AZURE_DB_HOST,database:process.env.AZURE_DB_NAME,user:process.env.AZURE_DB_USER,password:process.env.AZURE_DB_PASSWORD,port:5432,ssl:{rejectUnauthorized:false}});p.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name\").then(r=>{console.log('📊 Tables:',r.rows.length);r.rows.forEach(x=>console.log('  -',x.table_name));p.end()}).catch(e=>{console.error(e);p.end()})"
```

Expected output: ~30 tables including users, societies, events, roles, memberships, etc.

---

## Database Schema Overview

### Core Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts (students, admins) |
| `nust_schools` | NUST schools (SEECS, SMME, etc.) |
| `societies` | Registered societies |
| `events` | Society events |
| `event_categories` | Event categories |
| `society_memberships` | User roles in societies |
| `roles` | Role definitions (President, VP, Director, etc.) |
| `privileges` | Permission definitions |
| `role_privileges` | Role-permission mappings |
| `wings` | Society sub-divisions |
| `portfolios` | Specific roles within wings |
| `invite_tokens` | Invitation system for roles |
| `society_settings` | Society configuration |
| `tickets` | Event ticket registrations |
| `ticket_transfers` | Ticket transfer records |
| `payment_proofs` | Payment verification |
| `ratings` | Event/society ratings |
| `chats` | Society chat channels |
| `notifications` | User notifications |
| `audit_logs` | Activity audit trail |

### Role Hierarchy

| Role | Level | Description |
|------|-------|-------------|
| President | 10 | Full society control |
| Vice President | 8 | Deputy to president |
| Director | 5 | Wing/department head |
| Deputy Director | 3 | Assistant director |
| Member | 1 | Basic member |

---

## Common Issues & Solutions

### Issue: SSL connection error
**Solution**: Ensure SSL is enabled in your connection config:
```javascript
ssl: { rejectUnauthorized: false }
```

### Issue: "column does not exist" errors
**Solution**: Ensure all migrations are run:
```bash
node scripts/migrate-roles.js
node scripts/add-event-status.js
```

### Issue: Can't connect to Azure database
**Solution**: 
1. Check firewall rules in Azure Portal
2. Verify credentials in `.env.local`
3. Test connection with psql: `psql -h [host] -U [user] -d [database]`

### Issue: Seed script fails
**Solution**: 
1. Ensure schema is created first
2. Check if tables already have data (seed uses ON CONFLICT)
3. Run with: `node scripts/seed.js 2>&1 | tee seed-log.txt`

---

## Database Maintenance Scripts

Located in `scripts/` directory:

| Script | Purpose |
|--------|---------|
| `seed.js` | Populate with sample data |
| `migrate-roles.js` | Add role hierarchy tables |
| `add-event-status.js` | Add events.status column |
| `check-schema.js` | Verify table structure |
| `check-all-schemas.js` | Detailed schema inspection |
| `debug-check.js` | Check specific data issues |

---

## Test the Application

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Open browser: `http://localhost:3000`

3. Login as admin:
   - Email: `mhussain.bscs24seecs@seecs.edu.pk`
   - Password: `Mobile 786`

4. Or login as student:
   - Email: `student1@seecs.edu.pk`
   - Password: `test1234`

---

## Production Deployment

### Environment Variables for Production

```env
AZURE_DB_HOST=your-production-server.postgres.database.azure.com
AZURE_DB_PORT=5432
AZURE_DB_NAME=event_management
AZURE_DB_USER=your_admin_user
AZURE_DB_PASSWORD=strong_production_password
JWT_SECRET=use-a-strong-random-secret-256-bits
NODE_ENV=production
```

### Security Checklist

- ✅ Use strong passwords for database users
- ✅ Enable SSL/TLS for all connections
- ✅ Configure Azure firewall to allow only specific IPs
- ✅ Rotate JWT secret regularly
- ✅ Enable Azure backup/restore policies
- ✅ Set up monitoring and alerts
- ✅ Use connection pooling (max: 20 connections)
- ✅ Enable query logging for audit

---

## Support

For database setup issues:
1. Check this guide first
2. Review error logs in terminal
3. Contact project admin (Maaz Hussain)
4. Open GitHub issue with error details

---

## Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Azure PostgreSQL Docs](https://docs.microsoft.com/en-us/azure/postgresql/)
- [Node.js pg Library](https://node-postgres.com/)
- Project Repository: https://github.com/Maazhussain786/NUST_Event_Managment
