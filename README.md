# NUST Event Management System

A comprehensive Progressive Web App (PWA) for managing university societies, events, and student engagement at NUST.

## 🚀 Features

- **Society Management**: Register and manage societies with role-based hierarchy
- **Event System**: Create, manage, and register for society events
- **Role Hierarchy**: President → VP → Director → Deputy Director → Member
- **Ticket System**: Event registration with QR codes and transfers
- **Admin Panel**: Super admin dashboard for approvals and monitoring
- **Real-time Notifications**: Stay updated on events and activities
- **Progressive Web App**: Install on mobile and desktop
- **Dark/Light Mode**: Customizable theme support

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, Framer Motion
- **Backend**: Next.js API Routes (serverless)
- **Database**: Azure PostgreSQL 14
- **Authentication**: JWT with httpOnly cookies
- **PWA**: next-pwa with offline support

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ (local or Azure)
- Git

## 🏁 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/Maazhussain786/NUST_Event_Managment.git
cd NUST_Event_Managment
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

**Option A: Use Existing Azure Database (Team Members)**

Contact the admin for credentials, then create `.env.local`:

```env
AZURE_DB_HOST=eventmgmt-pg-server.postgres.database.azure.com
AZURE_DB_PORT=5432
AZURE_DB_NAME=event_management
AZURE_DB_USER=pgadmin
AZURE_DB_PASSWORD=[Get from admin]
JWT_SECRET=nust-event-mgmt-secret-2026
CRON_SECRET=[Generate a long random secret]
FCM_SERVER_KEY=[Optional: only needed for native FCM tokens]
NODE_ENV=development
```

**Test your connection:**
```bash
node test-connection.js
```

**Option B: Set Up Your Own Database**

See [DATABASE_SETUP.md](./DATABASE_SETUP.md) for complete instructions.

Quick setup:
```bash
# Create database
createdb event_management

# Run schema
psql -d event_management -f schema.sql
psql -d event_management -f schema-nust-additions.sql

# Run migrations
node scripts/migrate-roles.js
node scripts/add-event-status.js

# Seed data
node scripts/seed.js
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:4000](http://localhost:4000)

## 🔑 Default Login Credentials

### Admin Account
- **Email**: `mhussain.bscs24seecs@seecs.edu.pk`
- **Password**: `Mobile 786`

### Student Account
- **Email**: `student1@seecs.edu.pk`
- **Password**: `test1234`

## 📁 Project Structure

```
NUST_Event_Managment/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Auth pages (login, register)
│   │   ├── (main)/          # Main app pages
│   │   │   ├── home/
│   │   │   ├── societies/
│   │   │   ├── events/
│   │   │   ├── admin/
│   │   │   ├── profile/
│   │   │   └── ...
│   │   └── api/             # API routes
│   │       ├── auth/
│   │       ├── societies/
│   │       ├── events/
│   │       ├── admin/
│   │       └── ...
│   ├── components/          # Reusable components
│   ├── lib/                 # Utilities (db, auth)
│   └── styles/              # Global styles
├── scripts/                 # Database scripts
│   ├── seed.js
│   ├── migrate-roles.js
│   └── ...
├── schema.sql               # Database schema
├── public/                  # Static assets
├── DATABASE_SETUP.md        # Database setup guide
└── package.json
```

## 🗄️ Database Schema

30+ tables including:
- `users` - User accounts
- `societies` - Society profiles
- `events` - Event listings
- `society_memberships` - User roles
- `roles` - Role definitions (President, VP, etc.)
- `wings` - Society subdivisions
- `portfolios` - Specific role assignments
- `tickets` - Event registrations
- `notifications` - User notifications
- `audit_logs` - Activity tracking

See [DATABASE_SETUP.md](./DATABASE_SETUP.md) for complete schema details.

## 🎨 Key Features Explained

### Society Registration Flow
1. Student registers a society (PENDING status)
2. Admin reviews and approves/rejects
3. Upon approval, founder becomes President with full privileges
4. President can create wings, assign directors, invite members

### Role Hierarchy System
- **President (Level 10)**: Full control, can manage all roles
- **Vice President (Level 8)**: Deputy with most privileges
- **Director (Level 5)**: Manages specific wings
- **Deputy Director (Level 3)**: Assists directors
- **Member (Level 1)**: Basic access

### Event Management
- Societies create events (paid/free)
- Students register and get QR code tickets
- Ticket transfers between users
- Admin approval for events
- Real-time capacity tracking

## 🔧 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
node scripts/seed.js # Seed database
```

## 📱 PWA Features

- Offline capability
- Install on home screen
- Push notifications for event reminders
- App-like experience
- Automatic updates

### Push Reminder Scheduler

Run this endpoint every 10-15 minutes from your scheduler:

`POST /api/cron/push-event-reminders`

Headers:
- `x-cron-secret: <CRON_SECRET>`

This dispatches:
- Event starts in about 1 hour
- Registration closes in about 1 hour
- Limited seats left

## 🎯 Admin Panel

Super admins can:
- Approve/reject society registrations
- Approve/reject events
- Manage users
- View system statistics
- Monitor activity logs

Access: Login as admin → Profile → Admin Panel

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 🐛 Common Issues

### Database Connection Error
- Check `.env.local` credentials
- Verify Azure firewall rules
- Ensure SSL is enabled

### Missing Tables/Columns
```bash
node scripts/migrate-roles.js
node scripts/add-event-status.js
```

### Build Errors
```bash
rm -rf .next node_modules
npm install
npm run build
```

See [DATABASE_SETUP.md](./DATABASE_SETUP.md) for more troubleshooting.

## 📄 License

This project is private and proprietary to NUST.

## 👥 Team

- **Maaz Hussain** - Project Lead & Full Stack Developer
- Contact: mhussain.bscs24seecs@seecs.edu.pk

## 🔗 Links

- **Repository**: https://github.com/Maazhussain786/NUST_Event_Managment
- **Database Guide**: [DATABASE_SETUP.md](./DATABASE_SETUP.md)
- **Live Demo**: [Coming Soon]

---

**Built with ❤️ for NUST Community**
