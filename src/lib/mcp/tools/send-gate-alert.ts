import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "send_gate_alert",
  title: "Send gate alert",
  description: "Send a gate alert push notification to all active team members, as the signed-in user.",
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.functions.invoke("send-push-notification", { body: {} });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (data?.accepted === 0) {
      return { content: [{ type: "text", text: "No device push notifications were accepted. Check device registration and push delivery logs." }], isError: true };
    }

    return {
      content: [{ type: "text", text: `Alert submitted. Provider acceptance does not confirm delivery to every phone. ${JSON.stringify(data ?? {})}` }],
      structuredContent: { result: data ?? null },
    };
  },
});
