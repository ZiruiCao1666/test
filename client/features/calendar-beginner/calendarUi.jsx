import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as calendarHelpers from './calendarHelpers';
import styles from './calendarStyles';

const {
  normalizeBaseUrl,
  buildBaseUrl,
  formatDateTime,
  formatPercent,
  parseNumber,
  formatScoreValue,
  parseLinkHeader,
  sortByDueAt,
  isDueWithinWindow,
  isNewlyPublished,
  partitionAssignments,
  getSubmissionOrderKey,
  pickLatestSubmissions,
  getErrorMessage,
  readJsonSafely,
  getApiErrorMessage,
  isSubmissionSubmitted,
  isSubmissionOnTime,
  normalizeUpcomingEvent,
  getAccentColor,
  getCalendarDetailTypeLabel,
  formatCalendarDetailSchedule,
  getCalendarDetailConfirmLabel,
  getStyleWhen,
  getTextWhen,
  getCanvasConnectButtonText,
  getCanvasStorageHelperText,
  getPreviewEyebrowText,
  getPreviewTitleText,
  getPreviewSubtitleText,
  getNextUpcomingLabel,
  getTaskSaveButtonText,
  getSubmissionStatusText,
  getSubmissionDetailButtonText,
  getDetailFallbackText,
  getCollapseAssignmentsText,
  getTimePickerTitle,
  getYesNoText,
  buildAssignmentDetailKey,
  WEEK_HOUR_START,
  WEEK_HOUR_END,
  TIME_SLOTS,
  MINI_CALENDAR_LABELS,
  PREVIEW_ACCENTS,
  MONTH_LABELS,
  TIME_WHEEL_ITEM_HEIGHT,
  TIME_WHEEL_SIDE_ROWS,
  HOUR_12_OPTIONS,
  MINUTE_OPTIONS,
  MERIDIEM_OPTIONS,
  toSafeDate,
  startOfDay,
  addDays,
  addMonths,
  startOfWeek,
  isSameDay,
  isSameMonth,
  buildDateKey,
  formatMonthYear,
  formatShortDate,
  formatDayMonth,
  formatWeekday,
  formatClockTime,
  formatHourLabel,
  buildMiniCalendarDays,
  pickPreviewAccent,
  formatInputDate,
  isValidDateInput,
  isValidTimeInput,
  isQuarterHourTimeInput,
  parseDateInput,
  normalizeTaskDateInput,
  normalizeTaskTimeInput,
  normalizeCustomTask,
  formatTimeOnly,
  buildTaskDateTimeIso,
  formatTaskSchedule,
  formatPickerDateLabel,
  clampDateToMonthYear,
  parseTimeDraft,
  formatTimeDraftToValue,
  createEmptyTaskForm,
  sortTasks,
} = calendarHelpers;

const PickerWheelColumn = ({
  label,
  options,
  value,
  onChange,
  scrollRef,
}) => {
  const paddingHeight = TIME_WHEEL_ITEM_HEIGHT * TIME_WHEEL_SIDE_ROWS;

  const snapToOption = (index, animated = true) => {
    const safeIndex = Math.max(0, Math.min(options.length - 1, index));
    const nextValue = options[safeIndex];
    if (nextValue !== value) onChange(nextValue);
    let currentScrollRef = null;
    if (scrollRef && scrollRef.current) {
      currentScrollRef = scrollRef.current;
    }
    if (currentScrollRef && typeof currentScrollRef.scrollTo === 'function') {
      currentScrollRef.scrollTo({
        y: safeIndex * TIME_WHEEL_ITEM_HEIGHT,
        animated,
      });
    }
  };

  const handleSnap = (offsetY) => {
    const nextIndex = Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT);
    snapToOption(nextIndex, true);
  };

  return (
    <View style={styles.timeWheelGroup}>
      <Text style={styles.timeWheelLabel}>{label}</Text>
      <View style={styles.timeWheelColumn}>
        <View pointerEvents="none" style={styles.timeWheelGuideFrame} />
        <ScrollView
          ref={scrollRef}
          bounces={false}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
          snapToAlignment="start"
          contentContainerStyle={{ paddingVertical: paddingHeight }}
          onMomentumScrollEnd={(event) => handleSnap(event.nativeEvent.contentOffset.y)}
          onScrollEndDrag={(event) => handleSnap(event.nativeEvent.contentOffset.y)}
        >
          {options.map((option, index) => {
            const active = option === value;
            return (
              <Pressable
                key={label + '-' + String(option)}
                onPress={() => snapToOption(index)}
                style={styles.timeWheelItem}
              >
                <Text
                  style={[
                    styles.timeWheelItemText,
                    getStyleWhen(active, styles.timeWheelItemTextActive),
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

const MiniCalendarPanel = ({
  anchorDate,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  dateMarkersByDate,
  onPressTitle,
  titleHint,
  footerHint,
}) => {
  const calendarDays = useMemo(() => buildMiniCalendarDays(anchorDate), [anchorDate]);
  let titleHintNode = null;
  if (titleHint) {
    titleHintNode = <Text style={styles.miniCalendarTitleHint}>{titleHint}</Text>;
  }

  let titleNode = (
    <View style={styles.miniCalendarTitleBtn}>
      <Text style={styles.miniCalendarTitle}>{formatMonthYear(anchorDate)}</Text>
      {titleHintNode}
    </View>
  );
  if (onPressTitle) {
    titleNode = (
      <Pressable
        onPress={onPressTitle}
        style={({ pressed }) => [
          styles.miniCalendarTitleBtn,
          getStyleWhen(pressed, { opacity: 0.76 }),
        ]}
      >
        <Text style={styles.miniCalendarTitle}>{formatMonthYear(anchorDate)}</Text>
        {titleHintNode}
      </Pressable>
    );
  }

  let footerHintNode = null;
  if (footerHint) {
    footerHintNode = <Text style={styles.miniCalendarHint}>{footerHint}</Text>;
  }

  return (
    <View style={styles.miniCalendarCard}>
      <View style={styles.miniCalendarTopRow}>
        {titleNode}

        <View style={styles.miniCalendarNavRow}>
          <Pressable
            onPress={() => onChangeMonth(-1)}
            style={({ pressed }) => [
              styles.miniCalendarNavBtn,
              getStyleWhen(pressed, { opacity: 0.7 }),
            ]}
          >
            <Text style={styles.miniCalendarNavText}>{'<'}</Text>
          </Pressable>
          <Pressable
            onPress={() => onChangeMonth(1)}
            style={({ pressed }) => [
              styles.miniCalendarNavBtn,
              getStyleWhen(pressed, { opacity: 0.7 }),
            ]}
          >
            <Text style={styles.miniCalendarNavText}>{'>'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.miniCalendarWeekdays}>
        {MINI_CALENDAR_LABELS.map((label, index) => (
          <Text key={label + '-' + String(index)} style={styles.miniCalendarWeekdayText}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.miniCalendarGrid}>
        {calendarDays.map((day) => {
          const dateKey = buildDateKey(day.date);
          const markers = (dateMarkersByDate && dateMarkersByDate[dateKey]) || {
            count: 0,
            hasCanvas: false,
            hasCustom: false,
          };
          const isSelected = isSameDay(day.date, selectedDate);
          const isToday = isSameDay(day.date, new Date());
          let markersNode = null;
          if (markers.count > 0) {
            let canvasDotNode = null;
            if (markers.hasCanvas) {
              canvasDotNode = <View style={styles.miniCalendarDot} />;
            }
            let customDotNode = null;
            if (markers.hasCustom) {
              customDotNode = <View style={styles.miniCalendarDotCustom} />;
            }
            markersNode = (
              <View style={styles.miniCalendarDotRow}>
                {canvasDotNode}
                {customDotNode}
              </View>
            );
          }
          return (
            <Pressable
              key={day.key}
              onPress={() => onSelectDate(day.date)}
              style={({ pressed }) => [
                styles.miniCalendarCell,
                getStyleWhen(!day.inCurrentMonth, styles.miniCalendarCellMuted),
                getStyleWhen(isSelected, styles.miniCalendarCellSelected),
                getStyleWhen(isToday, styles.miniCalendarCellToday),
                getStyleWhen(pressed, { opacity: 0.82 }),
              ]}
            >
              <Text
                style={[
                  styles.miniCalendarCellText,
                  getStyleWhen(!day.inCurrentMonth, styles.miniCalendarCellTextMuted),
                  getStyleWhen(isSelected, styles.miniCalendarCellTextSelected),
                ]}
              >
                {day.date.getDate()}
              </Text>
              {markersNode}
            </Pressable>
          );
        })}
      </View>

      {footerHintNode}
    </View>
  );
};

const TaskSelectField = ({
  label,
  value,
  hint,
  onPress,
}) => {
  let hintNode = null;
  if (hint) {
    hintNode = <Text style={styles.taskFieldSelectHint}>{hint}</Text>;
  }

  return (
    <View style={styles.taskFieldBlock}>
      <Text style={styles.taskFieldLabel}>{label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.taskFieldSelect,
          getStyleWhen(pressed, { opacity: 0.82 }),
        ]}
      >
        <Text style={styles.taskFieldSelectValue}>{value}</Text>
        {hintNode}
      </Pressable>
    </View>
  );
};

const BottomSheetPicker = ({
  visible,
  onClose,
  onConfirm,
  title,
  subtitle,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  leadingLabel = '',
  onLeadingPress,
  cardStyle,
  children,
}) => {
  let leadingActionNode = <View style={styles.sheetActionSpacer} />;
  if (leadingLabel && onLeadingPress) {
    leadingActionNode = (
      <Pressable
        onPress={onLeadingPress}
        style={({ pressed }) => [
          styles.sheetGhostAction,
          getStyleWhen(pressed, { opacity: 0.82 }),
        ]}
      >
        <Text style={styles.sheetGhostActionText}>{leadingLabel}</Text>
      </Pressable>
    );
  }

  let subtitleNode = null;
  if (subtitle) {
    subtitleNode = <Text style={styles.sheetSubtitle}>{subtitle}</Text>;
  }

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={[styles.sheetCard, cardStyle]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetActionRow}>
            {leadingActionNode}

            <View style={styles.sheetActionRight}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.sheetGhostAction,
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                <Text style={styles.sheetGhostActionText}>{cancelLabel}</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.sheetPrimaryAction,
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                <Text style={styles.sheetPrimaryActionText}>{confirmLabel}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.sheetTitle}>{title}</Text>
          {subtitleNode}
          {children}
        </View>
      </View>
    </Modal>
  );
};

export { PickerWheelColumn, MiniCalendarPanel, TaskSelectField, BottomSheetPicker };
