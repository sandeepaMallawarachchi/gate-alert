import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_attendance",
  title: "List my attendance",
  description: "List the signed-in member's attendance records (check-in / check-out times), newest first.",
  inputSchema: {
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date (YYYY-MM-DD), inclusive."),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date (YYYY-MM-DD), inclusive."),
    limit: z.number().int().min(1).max(100).default(30).describe("Maximum number of records."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("attendance")
      .select("date, check_in_at, check_out_at")
      .eq("user_id", ctx.getUserId())
      .order("date", { ascending: false })
      .limit(limit ?? 30);

    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { records: data ?? [] },
    };
  },
});
