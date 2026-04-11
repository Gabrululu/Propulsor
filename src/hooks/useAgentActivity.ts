import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AgentActivityEvent {
  id: string;
  event_type: string;
  amount_usdc: number | null;
  tx_hash: string | null;
  vault_breakdown: Record<string, number> | null;
  blend_tx_hash: string | null;
  blend_success: boolean;
  error_message: string | null;
  created_at: string;
}

export interface AgentStatusData {
  is_active: boolean;
  watched_account: string | null;
  last_heartbeat: string | null;
  last_split_at: string | null;
  total_splits: number;
  total_yield_usdc: number;
}

export function useAgentActivity() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AgentActivityEvent[]>([]);
  const [status, setStatus] = useState<AgentStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }

    const loadData = async () => {
      const [activityRes, statusRes] = await Promise.all([
        supabase
          .from("agent_activity")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("agent_status")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (activityRes.data) {
        setEvents(activityRes.data as unknown as AgentActivityEvent[]);
      }
      if (statusRes.data) {
        setStatus(statusRes.data as unknown as AgentStatusData);
      }
      setLoading(false);
    };

    loadData();
  }, [user?.id]);

  // Realtime subscription for new activity
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("agent-activity-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_activity",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newEvent = payload.new as unknown as AgentActivityEvent;
          setEvents((prev) => [newEvent, ...prev].slice(0, 20));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_status",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setStatus(payload.new as unknown as AgentStatusData);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { events, status, loading };
}
