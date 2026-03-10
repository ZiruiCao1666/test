
import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';


export default function RewardsScreen() {
  const router = useRouter();
  const { user } = useUser();

  const avatarUrl = user?.imageUrl || null;

  const drinkItems = [
    { id: 'd1', title: 'coffee1 rewards', points: 120 },
    { id: 'd2', title: 'coffee2 rewards', points: 160 },
    { id: 'd3', title: 'drinks', points: 90 },
    { id: 'd4', title: 'drinks', points: 110 },
  ];

  const coupons = [
    { id: 'c1', title: 'discount coupon', points: 200 },
    { id: 'c2', title: 'discount coupon', points: 260 },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>rewards point Shop</Text>

          <View style={styles.headerRight}>
            <Pressable
              onPress={() => router.push('/orders')}
              style={({ pressed }) => [
                styles.ordersBtn,
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              <Text style={styles.ordersText}>my orders</Text>
            </Pressable>

            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>U</Text>
              </View>
            )}
          </View>
        </View>

        {/* Section: drinks */}
        <Text style={styles.sectionTitle}>drinks</Text>
        <View style={styles.grid}>
          {drinkItems.map((it) => (
            <View key={it.id} style={styles.card}>
              <Text style={styles.cardTitle}>{it.title}</Text>
              <Text style={styles.cardPoints}>{it.points} points</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 18 }} />

        {/* Section: discount coupon */}
        <Text style={styles.sectionTitle}>discount coupon</Text>
        <View style={styles.grid}>
          {coupons.map((it) => (
            <View key={it.id} style={styles.card}>
              <Text style={styles.cardTitle}>{it.title}</Text>
              <Text style={styles.cardPoints}>{it.points} points</Text>
            </View>
          ))}
        </View>

        {/* 留出底部空间，避免内容被 Tab Bar 挡住 */}
        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { paddingHorizontal: 18, paddingTop: 12 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ordersBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  ordersText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 12, fontWeight: '800', color: '#111827' },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 10,
    marginLeft: 2,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },

  card: {
    width: '48%',
    minHeight: 112,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 12,
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  cardPoints: {
    marginTop: 6,
    fontSize: 11,
    color: '#6b7280',
  },
});
