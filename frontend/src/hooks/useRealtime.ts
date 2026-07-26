import { useEffect, useRef } from "react";
import { getSupabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type PostgresChangesPayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, any>;
  old: Record<string, any>;
  table: string;
  schema: string;
};

/**
 * Subscribe to Supabase Realtime Postgres Changes on a single table.
 *
 * @param table   Table name (e.g. "chats")
 * @param event   "INSERT" | "UPDATE" | "DELETE" | "*"
 * @param filter  Optional Postgres changes filter (e.g. "owner_id=eq.<uuid>")
 * @param onEvent Callback with the change payload
 * @param enabled Defaults to true; set false to pause the subscription
 */
export function useRealtimeSubscription(
  table: string,
  event: "*" | "INSERT" | "UPDATE" | "DELETE",
  filter: string | undefined,
  onEvent: (payload: PostgresChangesPayload) => void,
  enabled = true,
) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    const client = getSupabase();
    if (!client) return;

    let channel: RealtimeChannel;

    const subscribe = () => {
      channel = client
        .channel(`rt:${table}:${filter ?? "*"}`)
        .on(
          "postgres_changes" as any,
          { event, schema: "public", table, filter },
          (payload: PostgresChangesPayload) => cbRef.current(payload),
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            // Retry after a brief backoff
            setTimeout(subscribe, 3000);
          }
        });
    };

    subscribe();

    return () => {
      if (channel) client.removeChannel(channel);
    };
  }, [table, event, filter, enabled]);
}

/**
 * Subscribe to multiple tables at once. Useful for pages that monitor
 * several related tables (e.g. runs + tool_invocations).
 */
export function useRealtimeSubscriptions(
  subscriptions: Array<{
    table: string;
    event?: "*" | "INSERT" | "UPDATE" | "DELETE";
    filter?: string;
    onEvent: (payload: PostgresChangesPayload) => void;
  }>,
  enabled = true,
) {
  const callbacksRef = useRef(
    subscriptions.map((s) => s.onEvent),
  );
  callbacksRef.current = subscriptions.map((s) => s.onEvent);

  useEffect(() => {
    if (!enabled) return;
    const client = getSupabase();
    if (!client) return;

    const channel = client.channel(`rt:multi:${Date.now()}`);

    for (let i = 0; i < subscriptions.length; i++) {
      const { table, event = "*", filter } = subscriptions[i];
      channel.on(
        "postgres_changes" as any,
        { event, schema: "public", table, filter },
        (payload: PostgresChangesPayload) => callbacksRef.current[i](payload),
      );
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        setTimeout(() => {
          client.removeChannel(channel);
        }, 3000);
      }
    });

    return () => {
      client.removeChannel(channel);
    };
  }, [JSON.stringify(subscriptions.map((s) => [s.table, s.event, s.filter])), enabled]);
}
