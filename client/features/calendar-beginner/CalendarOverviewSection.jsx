import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const getStyleWhen = (condition, style) => {
  if (!condition) {
    return null;
  }
  return style;
};

const noop = () => {};

const getDefaultEyebrow = (isConnected) => {
  return isConnected ? 'Connected' : 'Not connected';
};

const getDefaultTitle = (isConnected) => {
  return isConnected ? 'Calendar planner' : 'Before you sync';
};

const getDefaultSubtitle = (isConnected) => {
  if (isConnected) {
    return 'This area shows the main schedule and gives you one place to open item details.';
  }
  return 'Keep this section simple first. Once the connection works, move your real lists here.';
};

const getItemAccent = (item) => {
  if (item && item.accent) {
    return item.accent;
  }
  return '#2563eb';
};

const renderItemMeta = (item) => {
  const bits = [];
  if (item && item.course) {
    bits.push(String(item.course));
  }
  if (item && item.status) {
    bits.push(String(item.status));
  }
  if (item && item.schedule) {
    bits.push(String(item.schedule));
  }
  return bits.join(' | ');
};

const ItemCard = ({ item, onPress = noop }) => {
  return (
    <Pressable onPress={() => onPress(item)} style={({ pressed }) => [styles.itemCard, getStyleWhen(pressed, styles.pressed)]}>
      <View style={[styles.itemAccent, { backgroundColor: getItemAccent(item) }]} />
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle}>{item && item.title ? item.title : 'Untitled item'}</Text>
        {item && item.subtitle ? <Text style={styles.itemSubtitle}>{item.subtitle}</Text> : null}
        {renderItemMeta(item) ? <Text style={styles.itemMeta}>{renderItemMeta(item)}</Text> : null}
      </View>
    </Pressable>
  );
};

export default function CalendarOverviewSection({
  selectedPanel = 'calendar',
  onChangePanel = noop,
  isConnected = false,
  previewEyebrow = '',
  previewTitle = '',
  previewSubtitle = '',
  selectedDateLabel = '',
  nextUpcomingLabel = '',
  calendarItems = [],
  overviewItems = [],
  emptyCalendarText = 'No calendar items yet.',
  emptyOverviewText = 'No overview items yet.',
  onOpenItem = noop,
  detailVisible = false,
  detailItem = null,
  detailTitle = '',
  detailSubtitle = '',
  detailConfirmLabel = 'Close',
  onCloseDetail = noop,
  onConfirmDetail = noop,
}) {
  const safeCalendarItems = Array.isArray(calendarItems) ? calendarItems : [];
  const safeOverviewItems = Array.isArray(overviewItems) ? overviewItems : [];
  const activeItems = selectedPanel === 'overview' ? safeOverviewItems : safeCalendarItems;
  const emptyText = selectedPanel === 'overview' ? emptyOverviewText : emptyCalendarText;
  const sectionLabel = selectedPanel === 'overview' ? nextUpcomingLabel : selectedDateLabel;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.eyebrow}>{previewEyebrow || getDefaultEyebrow(isConnected)}</Text>
          <Text style={styles.title}>{previewTitle || getDefaultTitle(isConnected)}</Text>
          <Text style={styles.subtitle}>{previewSubtitle || getDefaultSubtitle(isConnected)}</Text>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            onPress={() => onChangePanel('calendar')}
            style={({ pressed }) => [
              styles.tab,
              getStyleWhen(selectedPanel === 'calendar', styles.tabActive),
              getStyleWhen(pressed, styles.pressed),
            ]}
          >
            <Text style={[styles.tabText, getStyleWhen(selectedPanel === 'calendar', styles.tabTextActive)]}>
              calendar
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onChangePanel('overview')}
            style={({ pressed }) => [
              styles.tab,
              getStyleWhen(selectedPanel === 'overview', styles.tabActive),
              getStyleWhen(pressed, styles.pressed),
            ]}
          >
            <Text style={[styles.tabText, getStyleWhen(selectedPanel === 'overview', styles.tabTextActive)]}>
              overview
            </Text>
          </Pressable>
        </View>
      </View>

      {sectionLabel ? <Text style={styles.sectionLabel}>{sectionLabel}</Text> : null}

      {activeItems.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemRow}>
          {activeItems.map((item, index) => (
            <ItemCard
              key={String(item.id || item.title || 'item-' + String(index))}
              item={item}
              onPress={onOpenItem}
            />
          ))}
        </ScrollView>
      )}

      <Modal transparent animationType="slide" visible={detailVisible} onRequestClose={onCloseDetail}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{detailTitle || (detailItem && detailItem.title) || 'Item detail'}</Text>
            {detailSubtitle ? <Text style={styles.modalSubtitle}>{detailSubtitle}</Text> : null}

            {detailItem && detailItem.description ? (
              <Text style={styles.modalBody}>{detailItem.description}</Text>
            ) : (
              <Text style={styles.modalBody}>Keep the detail modal focused on only the key fields at first.</Text>
            )}

            {renderItemMeta(detailItem) ? <Text style={styles.modalMeta}>{renderItemMeta(detailItem)}</Text> : null}

            <View style={styles.modalButtonRow}>
              <Pressable onPress={onCloseDetail} style={({ pressed }) => [styles.modalGhostButton, getStyleWhen(pressed, styles.pressed)]}>
                <Text style={styles.modalGhostButtonText}>Close</Text>
              </Pressable>

              <Pressable onPress={onConfirmDetail} style={({ pressed }) => [styles.modalPrimaryButton, getStyleWhen(pressed, styles.pressed)]}>
                <Text style={styles.modalPrimaryButtonText}>{detailConfirmLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: '#6b7280',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  tabActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  tabTextActive: {
    color: '#1d4ed8',
  },
  sectionLabel: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  itemRow: {
    gap: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  itemCard: {
    width: 220,
    minHeight: 120,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  itemAccent: {
    height: 5,
    width: '100%',
  },
  itemBody: {
    padding: 14,
    gap: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  itemSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#4b5563',
  },
  itemMeta: {
    fontSize: 12,
    lineHeight: 17,
    color: '#6b7280',
  },
  empty: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'flex-end',
    padding: 18,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
  },
  modalMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalGhostButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGhostButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.84,
  },
});
