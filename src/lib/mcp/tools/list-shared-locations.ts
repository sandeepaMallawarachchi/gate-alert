import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_shared_locations",
  title: "List shared locations",
  description: "List team members who are currently sharing their location, with coordinates and live status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("shared_locations")
      .select("user_id, latitude, longitude, accuracy, is_live, updated_at")
      .order("updated_at", { ascending: false });

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      for (const p of profiles ?? []) names.set(p.user_id, p.full_name);
    }

    const locations = rows.map((r) => ({
      name: names.get(r.user_id) ?? "Unknown",
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy: r.accuracy,
      is_live: r.is_live,
      updated_at: r.updated_at,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(locations) }],
      structuredContent: { locations },
    };
  },
});
