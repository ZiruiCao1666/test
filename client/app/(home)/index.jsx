import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function HomeScreen() {
  const { getToken, isSignedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);

  const canCheckIn = useMemo(() => isSignedIn && !checkedInToday, [isSignedIn, checkedInToday]);

  const authedFetch = useCallback(
    async (path, options = {}) => {
      if (!API_BASE_URL) throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");

      const token = await getToken();
      if (!token) throw new Error("Missing Clerk token. Are you signed in?");

      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      return data;
    },
    [getToken]
  );

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await authedFetch("/checkins/status");
      setPoints(data.points ?? 0);
      setTotalDays(data.totalDays ?? 0);
      setCheckedInToday(Boolean(data.checkedInToday));
    } catch (e) {
      Alert.alert("Load failed", e?.message || "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  const onCheckIn = useCallback(async () => {
    try {
      setLoading(true);
      const data = await authedFetch("/checkins/today", { method: "POST" });
      setPoints(data.points ?? 0);
      setTotalDays(data.totalDays ?? 0);
      setCheckedInToday(true);

      const gained = data.gainedPoints ?? 0;
      Alert.alert("Checked in", gained > 0 ? `+${gained} points` : "Already checked in today");
    } catch (e) {
      Alert.alert("Check-in failed", e?.message || "Failed to check in");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (isSignedIn) loadStatus();
  }, [isSignedIn, loadStatus]);

  return (
    <View style={{ flex: 1, padding: 20, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Student Motivation</Text>

      <View style={{ padding: 16, borderWidth: 1, borderRadius: 12, gap: 8 }}>
        <Text style={{ fontSize: 16 }}>Points: {points}</Text>
        <Text style={{ fontSize: 16 }}>Check-in days: {totalDays}</Text>
        <Text style={{ fontSize: 16 }}>
          Today: {checkedInToday ? "Checked in" : "Not yet"}
        </Text>
      </View>

      <Pressable
        onPress={onCheckIn}
        disabled={!canCheckIn || loading}
        style={{
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: "center",
          opacity: !canCheckIn || loading ? 0.5 : 1,
          borderWidth: 1,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600" }}>
          {checkedInToday ? "Checked in today" : loading ? "Loading..." : "Check in (+10)"}
        </Text>
      </Pressable>

      <Pressable
        onPress={loadStatus}
        disabled={!isSignedIn || loading}
        style={{
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
          opacity: !isSignedIn || loading ? 0.5 : 1,
          borderWidth: 1,
        }}
      >
        <Text style={{ fontSize: 14 }}>Refresh</Text>
      </Pressable>
    </View>
  );
}
