## Attendance feature

A new Attendance section where members mark **IN** and **OUT** once per day. The date and time are auto-filled by the system and cannot be edited. The buttons only work when the member is physically within **100 m** of the company location, which an admin sets by picking a spot on a Google Map.

---

### 1. Database (Lovable Cloud)

**`company_location`** — one row, edited by admins.
- name, latitude, longitude, radius_meters (default 100), address (optional label)
- Everyone (authenticated) can read; only admins can insert/update.

**`attendance`** — one row per user per day.
- user_id, date, check_in_at, check_in_lat/lng, check_out_at, check_out_lat/lng
- Unique (user_id, date). Timestamps set server-side (`now()`), never accepted from the client, so users can't fudge them.
- RLS: user sees/inserts/updates only their own row; admins see all.

### 2. New page: `/attendance`

**Header status**
- Live "You are 47 m from office — ✅ within range" or "❌ outside range (320 m away)".
- Uses browser `navigator.geolocation` (asks permission once).

**Today's card**
- Today's date + live clock (read-only display).
- **Check In** button — disabled unless in range and not yet checked in.
- **Check Out** button — disabled unless in range and already checked in.
- After tapping, shows the recorded time as fixed text (no edit).

**History list**
- User: their last 30 days.
- Admin: tab/toggle to see everyone's records, filterable by member and date.

### 3. Admin: set company location

New section inside Settings (admin only): **Company Location**.
- Google Map centered on current pin (or current GPS if none set).
- Search box (Places autocomplete) + draggable marker.
- "Use my current location" shortcut.
- Radius shown as a circle overlay (100 m).
- Save → writes to `company_location`.

Uses the existing Google Maps browser key already configured in the project.

### 4. Navigation

- Add a **Clock** icon to the bottom nav (mobile/tablet) and desktop header, linking to `/attendance`.
- Placed between MapPin and Users.

### 5. Anti-cheat / correctness notes

- Distance is checked **client-side to disable the button** and **re-checked in the insert/update policy** by including the user's coords in the row; a database trigger validates that they fall within `company_location.radius_meters` using the haversine formula, otherwise the insert is rejected. This prevents someone bypassing the UI.
- Timestamps are set by `default now()` and are not writable from the client.
- If no company location is configured, users see a friendly "Ask an admin to set the company location" message.

### 6. Files to add / edit

**New**
- `supabase/migrations/<timestamp>_attendance.sql` — tables, RLS, GRANTs, haversine trigger.
- `src/pages/Attendance.tsx` — main page.
- `src/components/CompanyLocationPicker.tsx` — admin map picker (loaded inside SettingsModal for admins).
- `src/hooks/useGeofence.ts` — distance + in-range hook.

**Edited**
- `src/App.tsx` — add `/attendance` route.
- `src/pages/Index.tsx` — add Clock icon to header + bottom nav.
- `src/components/SettingsModal.tsx` — admin-only Company Location section.

---

Approve and I'll build it. If you'd rather set the company location by pasting exact coordinates instead of picking on a map, tell me and I'll swap that step.