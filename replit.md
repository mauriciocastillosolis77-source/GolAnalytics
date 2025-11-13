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
  - **NEW: Batch Analysis Feature**: Automated match analysis that extracts frames every 2 seconds and processes entire videos
  - **Workflow**: 
    1. Coach uploads 30-minute match video
    2. Clicks "Analizar Partido Completo" button
    3. System extracts ~900 frames (1 every 2 seconds)
    4. Sends frames in batches of 10 to Railway API
    5. Displays ~35-40 suggested plays in interactive table
    6. Coach reviews/accepts/rejects suggestions in 10-15 minutes
    7. **Time Savings**: 85% reduction (from 3-4 hours → 15-20 minutes per match)
  - Progress bar shows real-time extraction and analysis progress
  - Results table shows Top-3 predictions per suggested play with confidence scores
- **AdminUsersPage** (`/admin/users`): Create new users with role and team assignment

### Backend Architecture

**Database**: Supabase (PostgreSQL-based BaaS) for data persistence and real-time capabilities.

**Authentication**: Supabase Auth handles user authentication (email/password). Row Level Security (RLS) policies enforce authorization at the database level.

**User Creation**: Admin users can create new users directly from the AdminUsersPage (`/admin/users`). The system uses:
- Client-side `supabase.auth.signUp()` to create the auth user
- Database trigger `on_auth_user_created` that automatically creates the user profile with role and team assignment
- Session restoration logic to keep the admin logged in after creating a new user (prevents automatic logout)
- Users can login immediately without email verification

**Data Schema**:
- `teams`: Team records with normalized names (UPPERCASE). All team names are automatically converted to uppercase to prevent duplicates (e.g., "Rayados" → "RAYADOS")
- `profiles`: User metadata including id (uuid), rol (admin/auxiliar), full_name, email, team_id (foreign key to teams), and created_at. Users are assigned to a specific team for data isolation
- `matches`: Match records with tournament, team_id (foreign key), team name (nombre_equipo), category, date, rival, and match day
- `players`: Player roster with name, number, position, and team_id (foreign key to teams)
- `tags`: Tagged actions during matches with player reference, action type, result, timestamp, and optional video metadata
- `videos`: Video file metadata including match reference, filename, start offset, duration, storage path

**Database Triggers**:
- `on_auth_user_created`: Automatically creates a profile record when a new auth user is created, extracting role, full_name, and team_id from user metadata

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

**AI Analysis Services**:

1. **Google Gemini API**: AI service for analyzing video frames frame-by-frame. The service:
   - Accepts base64-encoded video frames extracted from uploaded videos
   - Uses vision-language model to identify soccer plays
   - Returns structured JSON suggestions (timestamp, action, description)
   - Requires `VITE_API_KEY` environment variable
   - Used for spot-checking individual moments during manual tagging

2. **Custom Vision Model (Railway API)**: Custom-trained EfficientNetB0 model for soccer action classification. The service:
   - Deployed on Railway at `https://peaceful-art-production.up.railway.app`
   - Trained on 1,418 frames from actual match footage
   - Achieves 74% Top-3 accuracy on 16 action classes
   - Endpoints:
     - `/predict`: Analyzes single frame, returns Top-3 predictions
     - `/analyze-batch`: **NEW** - Processes up to 50 frames per request in batch mode
   - Frame interval: 1 frame every 2 seconds for full match analysis
   - Batch processing: Groups frames in sets of 10 for efficient processing
   - **Automated Match Analysis**: New feature allows coaches to analyze entire 30-minute match videos in 4-5 minutes vs 3-4 hours manual tagging
   - Returns confidence scores, alternative predictions, and timestamps for each detected action

**Third-Party Libraries**:
- **Recharts**: Chart visualization library for dashboard analytics
- **SheetJS (XLSX)**: Client-side Excel file generation for exporting player rosters and tag data (loaded via CDN)

**CDN Dependencies**: React, React DOM, React Router DOM, Supabase client, Recharts, and Google Gemini client are loaded via import maps from aistudiocdn.com rather than bundled.

**Environment Variables**:
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_KEY`: Supabase anonymous/public key (client-side)
- `VITE_API_KEY` / `GEMINI_API_KEY`: Google Gemini API key for AI analysis

**Deployment Platform**: Designed for deployment on platforms like Vercel or Replit. Vite build output serves static assets. User creation is handled client-side with database triggers managing profile creation.