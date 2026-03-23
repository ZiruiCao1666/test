import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  TIME_SLOTS,
  TIME_WHEEL_ITEM_HEIGHT,
  TIME_WHEEL_SIDE_ROWS,
  MINI_CALENDAR_LABELS,
  MONTH_LABELS,
  HOUR_12_OPTIONS,
  MINUTE_OPTIONS,
  MERIDIEM_OPTIONS,
  addMonths,
  buildDateKey,
  buildMiniCalendarDays,
  formatClockTime,
  formatDayMonth,
  formatHourLabel,
  formatMonthYear,
  formatPickerDateLabel,
  formatShortDate,
  formatTaskSchedule,
  formatTimeDraftToValue,
  formatTimeOnly,
  formatWeekday,
  getAccentColor,
  getCalendarDetailConfirmLabel,
  getNextUpcomingLabel,
  getPreviewEyebrowText,
  getPreviewSubtitleText,
  getPreviewTitleText,
  getStyleWhen,
  getTaskSaveButtonText,
  getTextWhen,
  isSameDay,
} from './calendar-helpers';

const PickerWheelColumn = ({
  styles,
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
  styles,
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
  styles,
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
  styles,
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

export const CalendarOverviewPanel = ({
  styles,
  visible,
  profileOverviewNode,
  courseGradesOverviewNode,
  dueSoonOverviewNode,
  assignmentsOverviewNode,
}) => {
  if (!visible) {
    return null;
  }

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        {profileOverviewNode}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Course Grades</Text>
        {courseGradesOverviewNode}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Due Soon</Text>
        {dueSoonOverviewNode}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assignments + Scores</Text>
        {assignmentsOverviewNode}
      </View>

      <View style={{ height: 90 }} />
    </>
  );
};

export const CalendarPlannerPanel = ({
  styles,
  visible,
  nextUpcomingItem,
  selectedDate,
  setSelectedDate,
  setSelectedView,
  changeMiniCalendarMonth,
  dateMarkersByDate,
  openMonthYearPicker,
  selectedView,
  changeCalendarWindow,
  weekDays,
  weekGridItems,
  selectedDayItems,
  monthItems,
  openCalendarItemDetail,
}) => {
  if (!visible) {
    return null;
  }

  let dayViewNode = null;
  if (selectedView === 'day') {
    let dayContentNode = <Text style={styles.empty}>No synced tasks on this day.</Text>;
    if (selectedDayItems.length > 0) {
      dayContentNode = selectedDayItems.map((item, index) => (
        <Pressable
          key={String(item.id) + '-day-' + String(index)}
          onPress={() => openCalendarItemDetail(item)}
          style={({ pressed }) => [
            styles.agendaCard,
            getStyleWhen(pressed, { opacity: 0.8 }),
          ]}
        >
          <View
            style={[
              styles.agendaAccent,
              { backgroundColor: getAccentColor(item, 'border', '#111827') },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.agendaTime}>{formatClockTime(item.date)}</Text>
            <Text style={styles.agendaTitle}>{item.title}</Text>
            <Text style={styles.agendaMeta}>
              {item.course || 'Canvas'} | {item.status}
            </Text>
          </View>
        </Pressable>
      ));
    }

    dayViewNode = <View style={styles.agendaList}>{dayContentNode}</View>;
  }

  let weekViewNode = null;
  if (selectedView === 'week') {
    weekViewNode = (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.weekHeaderRow}>
            <View style={styles.weekTimeHeader} />
            {weekDays.map((day) => {
              const active = buildDateKey(day) === buildDateKey(selectedDate);
              return (
                <Pressable
                  key={buildDateKey(day)}
                  onPress={() => setSelectedDate(day)}
                  style={[
                    styles.weekDayHeader,
                    getStyleWhen(active, styles.weekDayHeaderActive),
                  ]}
                >
                  <Text
                    style={[
                      styles.weekDayName,
                      getStyleWhen(active, styles.weekDayNameActive),
                    ]}
                  >
                    {formatWeekday(day)}
                  </Text>
                  <Text
                    style={[
                      styles.weekDayNumber,
                      getStyleWhen(active, styles.weekDayNumberActive),
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {TIME_SLOTS.map((hour) => (
            <View key={'hour-' + String(hour)} style={styles.weekGridRow}>
              <View style={styles.weekTimeCell}>
                <Text style={styles.weekTimeText}>{formatHourLabel(hour)}</Text>
              </View>

              {weekDays.map((day) => {
                const cellKey = String(day.getDay()) + '-' + String(hour);
                const cellItems = weekGridItems[cellKey] || [];
                let moreItemsNode = null;
                if (cellItems.length > 2) {
                  moreItemsNode = (
                    <Text style={styles.weekMoreText}>+{cellItems.length - 2} more</Text>
                  );
                }
                const selected = buildDateKey(day) === buildDateKey(selectedDate);
                const today = buildDateKey(day) === buildDateKey(new Date());
                return (
                  <Pressable
                    key={buildDateKey(day) + '-' + String(hour)}
                    onPress={() => setSelectedDate(day)}
                    style={[
                      styles.weekGridCell,
                      getStyleWhen(selected, styles.weekGridCellSelected),
                      getStyleWhen(today, styles.weekGridCellToday),
                    ]}
                  >
                    {cellItems.slice(0, 2).map((item, itemIndex) => (
                      <Pressable
                        key={String(item.id) + '-week-' + String(itemIndex)}
                        onPress={() => openCalendarItemDetail(item)}
                        style={({ pressed }) => [
                          styles.weekEventCard,
                          {
                            backgroundColor: getAccentColor(item, 'bg', '#eff6ff'),
                            borderLeftColor: getAccentColor(item, 'border', '#60a5fa'),
                          },
                          getStyleWhen(pressed, { opacity: 0.8 }),
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekEventTime,
                            { color: getAccentColor(item, 'text', '#1d4ed8') },
                          ]}
                        >
                          {formatClockTime(item.date)}
                        </Text>
                        <Text numberOfLines={1} style={styles.weekEventTitle}>
                          {item.title}
                        </Text>
                      </Pressable>
                    ))}
                    {moreItemsNode}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  let monthViewNode = null;
  if (selectedView === 'month') {
    let monthContentNode = <Text style={styles.empty}>No synced tasks in this month.</Text>;
    if (monthItems.length > 0) {
      monthContentNode = monthItems.slice(0, 12).map((item, index) => (
        <Pressable
          key={String(item.id) + '-month-' + String(index)}
          onPress={() => openCalendarItemDetail(item)}
          style={({ pressed }) => [
            styles.agendaCard,
            getStyleWhen(pressed, { opacity: 0.8 }),
          ]}
        >
          <View
            style={[
              styles.agendaAccent,
              { backgroundColor: getAccentColor(item, 'border', '#111827') },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.agendaTime}>
              {formatShortDate(item.date)} | {formatClockTime(item.date)}
            </Text>
            <Text style={styles.agendaTitle}>{item.title}</Text>
            <Text style={styles.agendaMeta}>
              {item.course || 'Canvas'} | {item.status}
            </Text>
          </View>
        </Pressable>
      ));
    }

    monthViewNode = <View style={styles.agendaList}>{monthContentNode}</View>;
  }

  return (
    <>
      <View style={styles.previewFocusRow}>
        <View style={styles.focusTodayCard}>
          <Text style={styles.focusTodayLabel}>TODAY</Text>
          <Text style={styles.focusTodayDate}>{formatDayMonth(new Date())}</Text>
          <Text style={styles.focusTodayMeta}>{getNextUpcomingLabel(nextUpcomingItem)}</Text>
        </View>

        <MiniCalendarPanel
          styles={styles}
          anchorDate={selectedDate}
          selectedDate={selectedDate}
          onSelectDate={(nextDate) => {
            setSelectedDate(nextDate);
            setSelectedView('week');
          }}
          onChangeMonth={changeMiniCalendarMonth}
          dateMarkersByDate={dateMarkersByDate}
          onPressTitle={openMonthYearPicker}
          titleHint="Tap title to choose month"
          footerHint="Tap a date to jump the planner to that week."
        />
      </View>

      <View style={styles.plannerShell}>
        <View style={styles.plannerToolbar}>
          <View style={styles.plannerArrowRow}>
            <Pressable
              onPress={() => changeCalendarWindow(-1)}
              style={({ pressed }) => [
                styles.plannerArrowBtn,
                getStyleWhen(pressed, { opacity: 0.7 }),
              ]}
            >
              <Text style={styles.plannerArrowText}>{'<'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setSelectedDate(new Date())}
              style={({ pressed }) => [
                styles.plannerTodayBtn,
                getStyleWhen(pressed, { opacity: 0.85 }),
              ]}
            >
              <Text style={styles.plannerTodayBtnText}>Today</Text>
            </Pressable>
            <Pressable
              onPress={() => changeCalendarWindow(1)}
              style={({ pressed }) => [
                styles.plannerArrowBtn,
                getStyleWhen(pressed, { opacity: 0.7 }),
              ]}
            >
              <Text style={styles.plannerArrowText}>{'>'}</Text>
            </Pressable>
          </View>

          <View style={styles.plannerViewSwitch}>
            {['day', 'week', 'month'].map((viewKey) => {
              const active = selectedView === viewKey;
              return (
                <Pressable
                  key={viewKey}
                  onPress={() => setSelectedView(viewKey)}
                  style={({ pressed }) => [
                    styles.plannerViewBtn,
                    getStyleWhen(active, styles.plannerViewBtnActive),
                    getStyleWhen(pressed, { opacity: 0.82 }),
                  ]}
                >
                  <Text
                    style={[
                      styles.plannerViewBtnText,
                      getStyleWhen(active, styles.plannerViewBtnTextActive),
                    ]}
                  >
                    {viewKey}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {dayViewNode}
        {weekViewNode}
        {monthViewNode}
      </View>
    </>
  );
};

export const CalendarTaskSection = ({
  styles,
  visible,
  taskForm,
  handleTaskFieldChange,
  openTaskDatePicker,
  openTimePicker,
  handleSubmitTask,
  taskSaving,
  editingTaskId,
  selectedDate,
  resetTaskComposer,
  tasksError,
  customTasks,
  tasksLoading,
  taskDeletingId,
  taskTogglingId,
  handleToggleTaskCompletion,
  handleEditTask,
  handleDeleteTask,
}) => {
  if (!visible) {
    return null;
  }

  let taskTimeFieldsNode = (
    <>
      <TaskSelectField
        styles={styles}
        label="Start"
        value={formatTimeOnly(taskForm.startTime)}
        hint="00 / 15 / 30 / 45"
        onPress={() => openTimePicker('startTime')}
      />
      <TaskSelectField
        styles={styles}
        label="End"
        value={formatTimeOnly(taskForm.endTime)}
        hint="00 / 15 / 30 / 45"
        onPress={() => openTimePicker('endTime')}
      />
    </>
  );
  if (taskForm.timingMode === 'deadline') {
    taskTimeFieldsNode = (
      <TaskSelectField
        styles={styles}
        label="Due time"
        value={formatTimeOnly(taskForm.dueTime)}
        hint="00 / 15 / 30 / 45"
        onPress={() => openTimePicker('dueTime')}
      />
    );
  }

  let taskSaveButtonNode = (
    <Text style={styles.taskSaveBtnText}>{getTaskSaveButtonText(editingTaskId)}</Text>
  );
  if (taskSaving) {
    taskSaveButtonNode = <ActivityIndicator color="#fff" size="small" />;
  }

  let taskCancelNode = null;
  if (editingTaskId) {
    taskCancelNode = (
      <Pressable
        onPress={() => resetTaskComposer(selectedDate)}
        style={({ pressed }) => [
          styles.taskCancelBtn,
          getStyleWhen(pressed, { opacity: 0.82 }),
        ]}
      >
        <Text style={styles.taskCancelBtnText}>Cancel</Text>
      </Pressable>
    );
  }

  let tasksErrorNode = null;
  if (tasksError) {
    tasksErrorNode = <Text style={styles.taskErrorText}>{tasksError}</Text>;
  }

  let customTaskListNode = null;
  if (tasksLoading) {
    customTaskListNode = (
      <View style={styles.taskLoadingWrap}>
        <ActivityIndicator />
      </View>
    );
  } else if (customTasks.length === 0) {
    customTaskListNode = <Text style={styles.empty}>No custom tasks yet.</Text>;
  } else {
    customTaskListNode = (
      <View style={styles.taskList}>
        {customTasks.map((task) => {
          const isDeleting = taskDeletingId === String(task.id);
          const isToggling = taskTogglingId === String(task.id);
          let checkContentNode = (
            <Text
              style={[
                styles.taskCheckBtnText,
                getStyleWhen(task.isCompleted, styles.taskCheckBtnTextActive),
              ]}
            >
              {getTextWhen(task.isCompleted, '\u2713', '')}
            </Text>
          );
          if (isToggling) {
            checkContentNode = (
              <ActivityIndicator size="small" color={task.isCompleted ? '#fff' : '#2563eb'} />
            );
          }
          return (
            <View key={'task-' + String(task.id)} style={styles.taskItemCard}>
              <Pressable
                onPress={() => handleToggleTaskCompletion(task)}
                disabled={isToggling}
                style={({ pressed }) => [
                  styles.taskCheckBtn,
                  getStyleWhen(task.isCompleted, styles.taskCheckBtnActive),
                  getStyleWhen(isToggling, { opacity: 0.6 }),
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                {checkContentNode}
              </Pressable>

              <View style={styles.taskItemBody}>
                <Text
                  style={[
                    styles.taskItemTitle,
                    getStyleWhen(task.isCompleted, styles.taskItemTitleDone),
                  ]}
                >
                  {task.title}
                </Text>
                <Text style={styles.taskItemMeta}>{formatTaskSchedule(task)}</Text>
              </View>

              <View style={styles.taskItemActions}>
                <Pressable
                  onPress={() => handleEditTask(task)}
                  style={({ pressed }) => [
                    styles.taskActionBtn,
                    getStyleWhen(pressed, { opacity: 0.82 }),
                  ]}
                >
                  <Text style={styles.taskActionBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteTask(task.id)}
                  disabled={isDeleting}
                  style={({ pressed }) => [
                    styles.taskActionBtn,
                    getStyleWhen(isDeleting, { opacity: 0.6 }),
                    getStyleWhen(pressed, { opacity: 0.82 }),
                  ]}
                >
                  <Text style={styles.taskDeleteBtnText}>
                    {getTextWhen(isDeleting, '...', 'Delete')}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>My Tasks</Text>
      <View style={styles.taskComposerCard}>
        <TextInput
          value={taskForm.title}
          onChangeText={(value) => handleTaskFieldChange('title', value)}
          placeholder="Task name"
          placeholderTextColor="#9ca3af"
          style={styles.taskTitleInput}
        />

        <View style={styles.taskModeRow}>
          {[
            { id: 'deadline', label: 'Due time' },
            { id: 'range', label: 'Time range' },
          ].map((mode) => {
            const active = taskForm.timingMode === mode.id;
            return (
              <Pressable
                key={mode.id}
                onPress={() => handleTaskFieldChange('timingMode', mode.id)}
                style={({ pressed }) => [
                  styles.taskModeChip,
                  getStyleWhen(active, styles.taskModeChipActive),
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                <Text
                  style={[
                    styles.taskModeChipText,
                    getStyleWhen(active, styles.taskModeChipTextActive),
                  ]}
                >
                  {mode.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.taskFieldsWrap}>
          <TaskSelectField
            styles={styles}
            label="Date"
            value={formatPickerDateLabel(taskForm.taskDate)}
            hint="Tap to choose"
            onPress={openTaskDatePicker}
          />

          {taskTimeFieldsNode}
        </View>

        <View style={styles.taskComposerActions}>
          <Pressable
            onPress={handleSubmitTask}
            disabled={taskSaving}
            style={({ pressed }) => [
              styles.taskSaveBtn,
              getStyleWhen(taskSaving, { opacity: 0.6 }),
              getStyleWhen(pressed, { opacity: 0.82 }),
            ]}
          >
            {taskSaveButtonNode}
          </Pressable>

          {taskCancelNode}
        </View>

        {tasksErrorNode}
      </View>

      {customTaskListNode}
    </View>
  );
};

export const CalendarPreviewSection = ({
  styles,
  isConnected,
  selectedPanel,
  setSelectedPanel,
  calendarPanelNode,
  taskSectionNode,
  overviewPanelNode,
}) => {
  return (
    <View style={styles.previewSection}>
      <View style={styles.previewHeaderRow}>
        <View style={styles.previewHeaderTextWrap}>
          <Text style={styles.previewEyebrow}>{getPreviewEyebrowText(isConnected)}</Text>
          <Text style={styles.previewTitle}>{getPreviewTitleText(isConnected)}</Text>
          <Text style={styles.previewSubtitle}>{getPreviewSubtitleText(isConnected)}</Text>
        </View>

        <View style={styles.previewTabRow}>
          <Pressable
            onPress={() => setSelectedPanel('calendar')}
            style={({ pressed }) => [
              styles.previewTab,
              getStyleWhen(selectedPanel === 'calendar', styles.previewTabActive),
              getStyleWhen(pressed, { opacity: 0.85 }),
            ]}
          >
            <Text
              style={[
                styles.previewTabText,
                getStyleWhen(selectedPanel === 'calendar', styles.previewTabActiveText),
              ]}
            >
              calendar
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSelectedPanel('overview')}
            style={({ pressed }) => [
              styles.previewTab,
              getStyleWhen(selectedPanel === 'overview', styles.previewTabActive),
              getStyleWhen(pressed, { opacity: 0.85 }),
            ]}
          >
            <Text
              style={[
                styles.previewTabText,
                getStyleWhen(selectedPanel === 'overview', styles.previewTabActiveText),
              ]}
            >
              overview
            </Text>
          </Pressable>
        </View>
      </View>

      {calendarPanelNode}
      {taskSectionNode}
      {overviewPanelNode}
    </View>
  );
};

export const CalendarBottomSheets = ({
  styles,
  taskDatePickerVisible,
  setTaskDatePickerVisible,
  confirmTaskDatePicker,
  taskDateDraft,
  setTaskDateDraft,
  taskDateMonthAnchor,
  setTaskDateMonthAnchor,
  dateMarkersByDate,
  timePickerVisible,
  setTimePickerVisible,
  confirmTimePicker,
  activeTimeField,
  getTimePickerTitle,
  timeDraft,
  setTimeDraft,
  hourWheelRef,
  minuteWheelRef,
  meridiemWheelRef,
  monthYearPickerVisible,
  setMonthYearPickerVisible,
  confirmMonthYearPicker,
  monthYearDraft,
  setMonthYearDraft,
  monthYearOptions,
  calendarDetailVisible,
  setCalendarDetailVisible,
  setSelectedCalendarItem,
  safeSelectedCalendarItem,
  selectedCalendarDetailSubtitle,
  selectedCalendarDetailNode,
  openUrl,
}) => {
  return (
    <>
      <BottomSheetPicker
        styles={styles}
        visible={taskDatePickerVisible}
        onClose={() => setTaskDatePickerVisible(false)}
        onConfirm={confirmTaskDatePicker}
        title="Choose date"
        subtitle={formatPickerDateLabel(taskDateDraft)}
        leadingLabel="Today"
        onLeadingPress={() => {
          const today = new Date();
          setTaskDateDraft(today);
          setTaskDateMonthAnchor(today);
        }}
      >
        <View style={styles.sheetMiniCalendarWrap}>
          <MiniCalendarPanel
            styles={styles}
            anchorDate={taskDateMonthAnchor}
            selectedDate={taskDateDraft}
            onSelectDate={(nextDate) => {
              setTaskDateDraft(nextDate);
              setTaskDateMonthAnchor(nextDate);
            }}
            onChangeMonth={(direction) => {
              const nextDate = addMonths(taskDateMonthAnchor, direction);
              if (nextDate) {
                setTaskDateMonthAnchor(nextDate);
              }
            }}
            dateMarkersByDate={dateMarkersByDate}
            footerHint="Tap a date to use it for this task."
          />
        </View>
      </BottomSheetPicker>

      <BottomSheetPicker
        styles={styles}
        visible={timePickerVisible}
        onClose={() => setTimePickerVisible(false)}
        onConfirm={confirmTimePicker}
        title={getTimePickerTitle(activeTimeField)}
        subtitle={formatTimeOnly(formatTimeDraftToValue(timeDraft))}
      >
        <View style={styles.timeWheelRow}>
          <PickerWheelColumn
            styles={styles}
            label="Hour"
            options={HOUR_12_OPTIONS}
            value={timeDraft.hour12}
            onChange={(hour12) => setTimeDraft((prev) => ({ ...prev, hour12 }))}
            scrollRef={hourWheelRef}
          />
          <PickerWheelColumn
            styles={styles}
            label="Minute"
            options={MINUTE_OPTIONS}
            value={timeDraft.minute}
            onChange={(minute) => setTimeDraft((prev) => ({ ...prev, minute }))}
            scrollRef={minuteWheelRef}
          />
          <PickerWheelColumn
            styles={styles}
            label="AM / PM"
            options={MERIDIEM_OPTIONS}
            value={timeDraft.meridiem}
            onChange={(meridiem) => setTimeDraft((prev) => ({ ...prev, meridiem }))}
            scrollRef={meridiemWheelRef}
          />
        </View>
      </BottomSheetPicker>

      <BottomSheetPicker
        styles={styles}
        visible={monthYearPickerVisible}
        onClose={() => setMonthYearPickerVisible(false)}
        onConfirm={confirmMonthYearPicker}
        title="Choose month"
        subtitle={MONTH_LABELS[monthYearDraft.month] + ' ' + String(monthYearDraft.year)}
      >
        <Text style={styles.monthYearSectionTitle}>Year</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthYearYearRow}
        >
          {monthYearOptions.map((year) => {
            const active = year === monthYearDraft.year;
            return (
              <Pressable
                key={'year-' + String(year)}
                onPress={() => setMonthYearDraft((prev) => ({ ...prev, year }))}
                style={({ pressed }) => [
                  styles.monthYearYearChip,
                  getStyleWhen(active, styles.monthYearYearChipActive),
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                <Text
                  style={[
                    styles.monthYearYearChipText,
                    getStyleWhen(active, styles.monthYearYearChipTextActive),
                  ]}
                >
                  {year}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.monthYearSectionTitle}>Month</Text>
        <View style={styles.monthYearGrid}>
          {MONTH_LABELS.map((label, index) => {
            const active = index === monthYearDraft.month;
            return (
              <Pressable
                key={'month-' + String(label)}
                onPress={() => setMonthYearDraft((prev) => ({ ...prev, month: index }))}
                style={({ pressed }) => [
                  styles.monthYearCell,
                  getStyleWhen(active, styles.monthYearCellActive),
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                <Text
                  style={[
                    styles.monthYearCellText,
                    getStyleWhen(active, styles.monthYearCellTextActive),
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheetPicker>

      <BottomSheetPicker
        styles={styles}
        visible={calendarDetailVisible}
        onClose={() => {
          setCalendarDetailVisible(false);
          setSelectedCalendarItem(null);
        }}
        onConfirm={() => {
          if (safeSelectedCalendarItem && safeSelectedCalendarItem.htmlUrl) {
            setCalendarDetailVisible(false);
            setSelectedCalendarItem(null);
            openUrl(safeSelectedCalendarItem.htmlUrl);
            return;
          }
          setCalendarDetailVisible(false);
          setSelectedCalendarItem(null);
        }}
        title={(safeSelectedCalendarItem && safeSelectedCalendarItem.title) || 'Task detail'}
        subtitle={selectedCalendarDetailSubtitle}
        confirmLabel={getCalendarDetailConfirmLabel(safeSelectedCalendarItem)}
      >
        {selectedCalendarDetailNode}
      </BottomSheetPicker>
    </>
  );
};
