import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import listMyAttendance from "./tools/list-my-attendance";
import listSharedLocations from "./tools/list-shared-locations";
import sendGateAlert from "./tools/send-gate-alert";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "gate-alert",
  title: "Gate Alert",
  version: "0.1.0",
  instructions:
    "Tools for Gate Alert, a team gate-access and attendance app. Read the signed-in member's profile and attendance records, see who is currently sharing their location, and send a gate alert push notification to the team.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listMyAttendance, listSharedLocations, sendGateAlert],
});
