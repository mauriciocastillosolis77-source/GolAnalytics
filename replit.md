# GolAnalytics

## Overview

GolAnalytics is a soccer analytics application designed for coaches to analyze team performance metrics through video tagging and AI-powered insights. The application enables coaches to:

- Tag and categorize player actions during match videos (passes, duels, shots, transitions, etc.)
- Manage match data, player rosters, and team information
- Generate performance analytics and visualizations
- Leverage AI (Google Gemini) to auto-suggest tagged actions from video frames
- Export tagged data for further analysis

The system supports role-based access control with admin and auxiliar (assistant) roles, where admins have full tagging capabilities while auxiliars have read-only access to dashboards. Admins can create new users through the built-in user management interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: React 19 with TypeScript, using Vite as the build tool and development server.

**Routing**: React Router DOM v7 with HashRouter for client-side routing. Protected routes enforce authentication and role-based access control through a custom `ProtectedRoute` component.

**State Management**: React Context API for authentication state (`AuthContext`). Local component state for UI-specific data. No additional state management library (Redux, Zustand) is used.

**UI Framework**: Tailwind CSS loaded via CDN for styling. Custom components built from scratch without a component library. Recharts library for data visualizations (bar charts, line charts, treemaps, scatter plots).

**Module System**: ES Modules with import maps defined in `index.html` to load dependencies from CDN (aistudiocdn.com). This approach eliminates the need for a traditional `node_modules` folder during development.

**Key Design Patterns**:
- **Context + Hooks**: Authentication state and user profile data are provided through `AuthContext` and consumed via `useAuth()` hook
- **Compound Components**: Layout system separates Header, Sidebar, and main content areas
- **Protected Routes**: Higher-order component pattern to guard routes based on authentication and user roles

**Admin Pages** (admin-only access):
- **VideoTaggerPage** (`/tagger`): Create matches, upload videos, tag player actions, manage players
- **AdminUsersPage** (`/admin/users`): Create new users with role and team assignment

### Backend Architecture

**Database**: Supabase (PostgreSQL-based BaaS) for data persistence and real-time capabilities.

**Authentication**: Supabase Auth handles user authentication (email/password). Row Level Security (RLS) policies enforce authorization at the database level.

**Serverless Functions**: Vercel serverless functions (`/api` directory) handle administrative tasks:
- `/api/admin/create-user.ts`: Creates new users with role assignment (protected by admin token)
- `/api/admin/create-user-proxy.ts`: Proxy endpoint that validates admin JWT before creating users
- `/api/predict.py`: Python-based endpoint for AI predictions (currently returns mock data)

**Data Schema**:
- `teams`: Team records with normalized names (UPPERCASE). All team names are automatically converted to uppercase to prevent duplicates (e.g., "Rayados" → "RAYADOS")
- `profiles`: User metadata including role (admin/auxiliar), username, avatar, and team_id (foreign key to teams). Users are assigned to a specific team for data isolation
- `matches`: Match records with tournament, team_id (foreign key), team name (nombre_equipo), category, date, rival, and match day
- `players`: Player roster with name, number, position, and team_id (foreign key to teams)
- `tags`: Tagged actions during matches with player reference, action type, result, timestamp, and optional video metadata
- `videos`: Video file metadata including match reference, filename, start offset, duration, storage path

**Multi-Tenancy Architecture**:
- **Team-Based Data Isolation**: All users are assigned to a team via `profiles.team_id`. Data is filtered by team to ensure users only see their team's information
- **Team Name Normalization**: All team names are automatically normalized to UPPERCASE in both frontend (`VideoTaggerPage.tsx`) and database (`upsert_team()` function) to prevent case-sensitive duplicates
- **Admin Cross-Team Access**: Admin users can view and manage data across all teams. The VideoTaggerPage includes a team selector allowing admins to create matches for any team (existing or new)
- **Team Auto-Creation**: When creating a match, if the specified team doesn't exist, it's automatically created via the `upsert_team()` SQL function

**Row Level Security (RLS)**:
- **Admin role**: Can view/edit all teams' data (matches, players, tags, videos). RLS policies check `auth.uid() IN (SELECT user_id FROM profiles WHERE role = 'admin')`
- **Auxiliar role**: Can only view data from their assigned team. RLS policies check `team_id = (SELECT team_id FROM profiles WHERE user_id = auth.uid())`
- Users can read/update their own profile
- Service role key used in serverless functions bypasses RLS for administrative operations

### External Dependencies

**Supabase**: Backend-as-a-Service providing:
- PostgreSQL database with RLS
- Authentication and user management
- Real-time subscriptions (not currently used but available)
- Storage (for potential video file uploads)

**Google Gemini API**: AI service for analyzing video frames and suggesting tagged actions. The service:
- Accepts base64-encoded video frames extracted from uploaded videos
- Uses vision-language model to identify soccer plays
- Returns structured JSON suggestions (timestamp, action, description)
- Requires `VITE_API_KEY` environment variable

**Third-Party Libraries**:
- **Recharts**: Chart visualization library for dashboard analytics
- **SheetJS (XLSX)**: Client-side Excel file generation for exporting player rosters and tag data (loaded via CDN)

**CDN Dependencies**: React, React DOM, React Router DOM, Supabase client, Recharts, and Google Gemini client are loaded via import maps from aistudiocdn.com rather than bundled.

**Environment Variables**:
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_KEY`: Supabase anonymous/public key (client-side)
- `VITE_API_KEY` / `GEMINI_API_KEY`: Google Gemini API key for AI analysis
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase admin key (server-side only, used in serverless functions)
- `ADMIN_CREATION_TOKEN`: Secret token for protecting user creation endpoints

**Deployment Platform**: Designed for Vercel deployment with serverless functions. Vite build output serves static assets while `/api` functions handle backend operations.