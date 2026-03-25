import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as calendarHelpers from './calendarHelpers';
import styles from './calendarStyles';
import { MiniCalendarPanel, TaskSelectField } from './calendarUi';

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

export function CalendarDetailContent({
  selectedCalendarItem,
  submissionDetailsByAssignment,
  profile,
}) {
    const safeSelectedCalendarItem = selectedCalendarItem || null;
    let selectedCalendarDetailKey = '';
    if (
      safeSelectedCalendarItem &&
      safeSelectedCalendarItem.source === 'assignment' &&
      safeSelectedCalendarItem.courseId &&
      safeSelectedCalendarItem.assignmentId
    ) {
      selectedCalendarDetailKey = buildAssignmentDetailKey(
        safeSelectedCalendarItem.courseId,
        safeSelectedCalendarItem.assignmentId
      );
    }
    let selectedCalendarDetailState = {};
  if (selectedCalendarDetailKey) {
    selectedCalendarDetailState = submissionDetailsByAssignment[selectedCalendarDetailKey] || {};
  }
  const selectedCalendarDetailData = selectedCalendarDetailState.data || null;
  const selectedCalendarTeacherComments = useMemo(() => {
      if (!selectedCalendarDetailData) {
        return [];
      }
      let detailComments = [];
      if (Array.isArray(selectedCalendarDetailData.submission_comments)) {
        detailComments = selectedCalendarDetailData.submission_comments;
      }
      const safeProfile = profile || {};
      let currentUserId = '';
      if (safeProfile.id !== null && safeProfile.id !== undefined) {
        currentUserId = String(safeProfile.id);
      }
      return detailComments.filter(
        (comment) => {
          const safeComment = comment || {};
          let authorId = '';
          if (safeComment.author_id !== undefined) {
            authorId = safeComment.author_id;
          }
          return (
            !currentUserId ||
            String(authorId) !== currentUserId
          );
        }
      );
    }, [profile, selectedCalendarDetailData]);
    let selectedCalendarDetailNode = null;
    if (safeSelectedCalendarItem) {
      let assignmentDetailSectionNode = null;
      if (safeSelectedCalendarItem.source === 'assignment') {
        let teacherCommentsNode = null;
        if (selectedCalendarDetailState.loading) {
          teacherCommentsNode = (
            <Text style={styles.detailMuted}>Loading submission detail...</Text>
          );
        } else if (selectedCalendarDetailState.error) {
          teacherCommentsNode = (
            <Text style={styles.detailError}>
              Failed to load detail: {selectedCalendarDetailState.error}
            </Text>
          );
        } else if (selectedCalendarTeacherComments.length === 0) {
          teacherCommentsNode = (
            <Text style={styles.detailMuted}>No teacher comments yet.</Text>
          );
        } else {
          teacherCommentsNode = selectedCalendarTeacherComments.map((comment, index) => (
            <View
              key={'calendar-detail-comment-' + String((comment || {}).id || index)}
              style={styles.detailRow}
            >
              <Text style={styles.detailMeta}>
                {formatDateTime((comment || {}).created_at)}
              </Text>
              <Text style={styles.detailText}>
                {(comment || {}).comment || 'No comment text'}
              </Text>
            </View>
          ));
        }

        assignmentDetailSectionNode = (
          <>
            <View style={styles.detailRow}>
              <Text style={styles.detailMeta}>Score</Text>
              <Text style={styles.detailText}>
                {formatScoreValue(
                  safeSelectedCalendarItem.score,
                  safeSelectedCalendarItem.pointsPossible
                )}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailMeta}>Submitted</Text>
              <Text style={styles.detailText}>
                {getTextWhen(
                  safeSelectedCalendarItem.submittedAt,
                  formatDateTime(safeSelectedCalendarItem.submittedAt),
                  'Not submitted'
                )}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailMeta}>Late</Text>
              <Text style={styles.detailText}>
                {getYesNoText(safeSelectedCalendarItem.late)}
              </Text>
            </View>
            <Text style={styles.detailHeading}>Teacher comments</Text>
            {teacherCommentsNode}
          </>
        );
      }

      let customTaskNoteNode = null;
      if (safeSelectedCalendarItem.source === 'customTask') {
        customTaskNoteNode = (
          <Text style={styles.sheetDetailNote}>
            This is your own task stored in the app and merged into the planner.
          </Text>
        );
      }

      selectedCalendarDetailNode = (
        <View style={styles.sheetDetailPanel}>
          <View style={styles.detailRow}>
            <Text style={styles.detailMeta}>Type</Text>
            <Text style={styles.detailText}>{getCalendarDetailTypeLabel(safeSelectedCalendarItem)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailMeta}>Course</Text>
            <Text style={styles.detailText}>{safeSelectedCalendarItem.course || 'Canvas'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailMeta}>Status</Text>
            <Text style={styles.detailText}>{safeSelectedCalendarItem.status || 'N/A'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailMeta}>Schedule</Text>
            <Text style={styles.detailText}>{formatCalendarDetailSchedule(safeSelectedCalendarItem)}</Text>
          </View>

          {assignmentDetailSectionNode}
          {customTaskNoteNode}
        </View>
      );
    }

  return selectedCalendarDetailNode;
}

export function CalendarOverviewPanel({
  selectedPanel,
  profile,
  courses,
  enrollmentsByCourse,
  submissionsByCourse,
  events,
  assignmentsByCourse,
  expandedAssignmentsByCourse,
  setExpandedAssignmentsByCourse,
  submissionDetailsByAssignment,
  handleToggleSubmissionDetail,
  openUrl,
}) {
    const safeProfile = profile || {};
    let currentProfileId = '';
    if (safeProfile.id !== null && safeProfile.id !== undefined) {
      currentProfileId = String(safeProfile.id);
    }

    let profileOverviewNode = <Text style={styles.empty}>No profile synced yet.</Text>;
    if (profile) {
      let profileEmailNode = null;
      if (safeProfile.primary_email || safeProfile.login_id) {
        profileEmailNode = (
          <Text style={styles.profileMeta}>
            Email/Login:
            {' '}
            {safeProfile.primary_email || safeProfile.login_id}
          </Text>
        );
      }

      let profileTimeZoneNode = null;
      if (safeProfile.time_zone) {
        profileTimeZoneNode = (
          <Text style={styles.profileMeta}>
            Time zone:
            {' '}
            {safeProfile.time_zone}
          </Text>
        );
      }

      profileOverviewNode = (
        <View style={styles.profileCard}>
          <Text style={styles.profileName}>{safeProfile.name || 'Unknown user'}</Text>
          {profileEmailNode}
          {profileTimeZoneNode}
        </View>
      );
    }

    let courseGradesOverviewNode = <Text style={styles.empty}>No courses synced.</Text>;
    if (courses.length > 0) {
      courseGradesOverviewNode = (
        <View style={styles.events}>
          {courses.map((course, courseIndex) => {
            const safeCourse = course || {};
            const courseId = String(safeCourse.id || '');
            const enrollment = enrollmentsByCourse[courseId];
            const safeEnrollment = enrollment || {};
            const grades = safeEnrollment.grades || {};
            const submissionEntry = submissionsByCourse[courseId] || {};
            const submissionSummary = submissionEntry.summary || {};
            const courseTerm = safeCourse.term || {};
            const termName = courseTerm.name || 'No term';
            const completionText = formatPercent(submissionSummary.completionRate);
            const onTimeText = formatPercent(submissionSummary.onTimeRate);
            let gradeLinkNode = null;
            if (grades.html_url) {
              gradeLinkNode = (
                <Pressable
                  onPress={() => openUrl(grades.html_url)}
                  style={({ pressed }) => [
                    styles.inlineLinkBtn,
                    getStyleWhen(pressed, { opacity: 0.7 }),
                  ]}
                >
                  <Text style={styles.inlineLinkText}>Open grade page</Text>
                </Pressable>
              );
            }

            return (
              <View key={courseId + '-grade-' + String(courseIndex)} style={styles.gradeCard}>
                <Text style={styles.gradeCourseName}>
                  {safeCourse.name || safeCourse.course_code || 'Untitled course'}
                </Text>
                <Text style={styles.gradeMeta}>Term: {termName}</Text>
                <Text style={styles.gradeMeta}>Completion: {completionText}</Text>
                <Text style={styles.gradeMeta}>On-time: {onTimeText}</Text>
                {gradeLinkNode}
              </View>
            );
          })}
        </View>
      );
    }

    let dueSoonOverviewNode = <Text style={styles.empty}>No upcoming events.</Text>;
    if (events.length > 0) {
      dueSoonOverviewNode = (
        <View style={styles.events}>
          {events.map((event, eventIndex) => {
            let eventCourseNode = null;
            if (event.course) {
              eventCourseNode = <Text style={styles.eventCourse}>{event.course}</Text>;
            }
            let eventLinkNode = null;
            if (event.htmlUrl) {
              eventLinkNode = <Text style={styles.eventLink}>Open in Canvas</Text>;
            }
            return (
              <Pressable
                key={String(event.id) + '-event-' + String(eventIndex)}
                onPress={() => openUrl(event.htmlUrl)}
                style={({ pressed }) => [
                  styles.eventItem,
                  getStyleWhen(event.htmlUrl, styles.eventClickable),
                  getStyleWhen(pressed, { opacity: 0.7 }),
                ]}
              >
                <View style={styles.eventTag}>
                  <Text style={styles.eventTagText}>{event.type}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  {eventCourseNode}
                  <Text style={styles.eventDate}>{formatDateTime(event.date)}</Text>
                  {eventLinkNode}
                </View>
              </Pressable>
            );
          })}
        </View>
      );
    }

    let assignmentsOverviewNode = <Text style={styles.empty}>No assignment data yet.</Text>;
    if (courses.length > 0) {
      assignmentsOverviewNode = courses.map((course, courseIndex) => {
        const safeCourse = course || {};
        const courseId = String(safeCourse.id);
        const assignmentEntry = assignmentsByCourse[courseId];
        let assignments = [];
        if (assignmentEntry && Array.isArray(assignmentEntry.items)) {
          assignments = assignmentEntry.items;
        }
        const submissionEntry = submissionsByCourse[courseId] || {};
        const submissionLookup = submissionEntry.byAssignment || {};
        const nowTs = Date.now();
        const partitionedAssignments = partitionAssignments(assignments, nowTs);
        const visibleItems = partitionedAssignments.visibleItems;
        const collapsedItems = partitionedAssignments.collapsedItems;
        const isExpanded = Boolean(expandedAssignmentsByCourse[courseId]);
        let displayItems = visibleItems;
        if (isExpanded) {
          displayItems = visibleItems.concat(collapsedItems);
        }

        let assignmentsContentNode = null;
        if (assignments.length === 0) {
          assignmentsContentNode = (
            <Text style={styles.empty}>No assignments in this course.</Text>
          );
        } else {
          let assignmentHintNode = null;
          if (displayItems.length === 0) {
            assignmentHintNode = (
              <Text style={styles.assignmentHint}>
                No assignments in current window. Expand to see all.
              </Text>
            );
          }

          let assignmentCardsNode = displayItems.map((assignment, assignmentIndex) => {
            const safeAssignment = assignment || {};
            const submission = submissionLookup[String(safeAssignment.id)] || null;
            const safeSubmission = submission || {};
            const scoreText = formatScoreValue(
              safeSubmission.score,
              safeAssignment.points_possible
            );
            const detailKey = buildAssignmentDetailKey(courseId, safeAssignment.id);
            const detailState = submissionDetailsByAssignment[detailKey] || {};
            const detailData = detailState.data || null;
            let teacherComments = [];
            if (detailData && Array.isArray(detailData.submission_comments)) {
              teacherComments = detailData.submission_comments.filter((comment) => {
                const safeComment = comment || {};
                let authorId = '';
                if (safeComment.author_id !== undefined) {
                  authorId = safeComment.author_id;
                }
                if (!currentProfileId) {
                  return true;
                }
                return String(authorId) !== currentProfileId;
              });
            }
            let detailHistory = [];
            if (detailData && Array.isArray(detailData.submission_history)) {
              detailHistory = detailData.submission_history;
            }

            let assignmentDetailNode = (
              <Text style={styles.detailMuted}>
                {getDetailFallbackText(detailState)}
              </Text>
            );
            if (detailData) {
              let teacherCommentsNode = null;
              if (teacherComments.length === 0) {
                teacherCommentsNode = (
                  <Text style={styles.detailMuted}>No teacher comments yet.</Text>
                );
              } else {
                teacherCommentsNode = teacherComments.map((comment, index) => {
                  const safeComment = comment || {};
                  return (
                    <View
                      key={courseId + '-assignment-' + String(safeAssignment.id) + '-comment-' + String(safeComment.id || 'x') + '-' + String(index)}
                      style={styles.detailRow}
                    >
                      <Text style={styles.detailMeta}>
                        {safeComment.author_name || 'Instructor'}
                        {' | '}
                        {formatDateTime(safeComment.created_at)}
                      </Text>
                      <Text style={styles.detailText}>
                        {safeComment.comment || '-'}
                      </Text>
                    </View>
                  );
                });
              }

              let detailHistoryNode = null;
              if (detailHistory.length === 0) {
                detailHistoryNode = (
                  <Text style={styles.detailMuted}>No attempt history.</Text>
                );
              } else {
                detailHistoryNode = detailHistory.map((attempt, index) => {
                  const safeAttempt = attempt || {};
                  return (
                    <View
                      key={courseId + '-assignment-' + String(safeAssignment.id) + '-attempt-' + String(safeAttempt.id || safeAttempt.attempt || 'x') + '-' + String(index)}
                      style={styles.detailRow}
                    >
                      <Text style={styles.detailMeta}>
                        Attempt {safeAttempt.attempt || index + 1}
                      </Text>
                      <Text style={styles.detailText}>
                        Submitted: {formatDateTime(safeAttempt.submitted_at)}
                      </Text>
                      <Text style={styles.detailText}>
                        Late: {getYesNoText(safeAttempt.late)}
                      </Text>
                      <Text style={styles.detailText}>
                        Score:
                        {' '}
                        {formatScoreValue(
                          safeAttempt.score,
                          safeAttempt.points_possible || safeAssignment.points_possible
                        )}
                      </Text>
                    </View>
                  );
                });
              }

              assignmentDetailNode = (
                <>
                  <Text style={styles.detailMeta}>
                    Late: {getYesNoText(detailData.late)}
                  </Text>
                  <Text style={styles.detailMeta}>
                    Submitted at: {formatDateTime(detailData.submitted_at)}
                  </Text>
                  <Text style={styles.detailHeading}>Teacher comments</Text>
                  {teacherCommentsNode}
                  <Text style={styles.detailHeading}>Attempt history</Text>
                  {detailHistoryNode}
                </>
              );
            }

            let detailPanelNode = null;
            if (detailState.expanded) {
              let detailErrorNode = null;
              if (detailState.error) {
                detailErrorNode = (
                  <Text style={styles.detailError}>
                    Failed to load detail: {detailState.error}
                  </Text>
                );
              }
              detailPanelNode = (
                <View style={styles.detailPanel}>
                  {detailErrorNode}
                  {assignmentDetailNode}
                </View>
              );
            }

            let openAssignmentNode = null;
            if (safeAssignment.html_url) {
              openAssignmentNode = (
                <Pressable
                  onPress={() => openUrl(safeAssignment.html_url)}
                  style={({ pressed }) => [
                    styles.inlineLinkBtn,
                    getStyleWhen(pressed, { opacity: 0.7 }),
                  ]}
                >
                  <Text style={styles.inlineLinkText}>Open assignment</Text>
                </Pressable>
              );
            }

            return (
              <View
                key={courseId + '-assignment-' + String(safeAssignment.id) + '-' + String(assignmentIndex)}
                style={[
                  styles.assignmentItem,
                  getStyleWhen(safeAssignment.html_url, styles.eventClickable),
                ]}
              >
                <Text style={styles.assignmentTitle}>
                  {safeAssignment.name || 'Untitled assignment'}
                </Text>
                <Text style={styles.assignmentMeta}>
                  Due:
                  {' '}
                  {formatDateTime(safeAssignment.due_at)}
                </Text>
                <Text style={styles.assignmentMeta}>
                  Score: {scoreText}
                </Text>
                <Text style={styles.assignmentMeta}>
                  Status:
                  {' '}
                  {getSubmissionStatusText(safeSubmission)}
                </Text>
                <Pressable
                  onPress={() => handleToggleSubmissionDetail(courseId, safeAssignment.id)}
                  style={({ pressed }) => [
                    styles.detailBtn,
                    getStyleWhen(pressed, { opacity: 0.7 }),
                  ]}
                >
                  <Text style={styles.detailBtnText}>
                    {getSubmissionDetailButtonText(detailState)}
                  </Text>
                </Pressable>
                {detailPanelNode}
                {openAssignmentNode}
              </View>
            );
          });

          let collapseAssignmentsNode = null;
          if (collapsedItems.length > 0) {
            collapseAssignmentsNode = (
              <Pressable
                onPress={() =>
                  setExpandedAssignmentsByCourse((prev) => ({
                    ...prev,
                    [courseId]: !isExpanded,
                  }))
                }
                style={({ pressed }) => [
                  styles.collapseBtn,
                  getStyleWhen(pressed, { opacity: 0.7 }),
                ]}
              >
                <Text style={styles.collapseBtnText}>
                  {getCollapseAssignmentsText(isExpanded, collapsedItems.length)}
                </Text>
              </Pressable>
            );
          }

          assignmentsContentNode = (
            <View style={styles.assignments}>
              {assignmentHintNode}
              {assignmentCardsNode}
              {collapseAssignmentsNode}
            </View>
          );
        }

        return (
          <View key={courseId + '-assignment-group-' + String(courseIndex)} style={styles.assignmentGroup}>
            <Text style={styles.assignmentCourseName}>
              {safeCourse.name || safeCourse.course_code || 'Untitled course'}
            </Text>
            {assignmentsContentNode}
          </View>
        );
      });
    }

    let overviewPanelNode = null;
    if (isConnected && selectedPanel === 'overview') {
      overviewPanelNode = (
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
    }

  return overviewPanelNode;
}

export function CalendarPlannerPanel({
  selectedPanel,
  selectedView,
  selectedDate,
  nextUpcomingItem,
  dateMarkersByDate,
  selectedDayItems,
  weekDays,
  weekGridItems,
  monthItems,
  setSelectedDate,
  setSelectedView,
  changeCalendarWindow,
  changeMiniCalendarMonth,
  openMonthYearPicker,
  openCalendarItemDetail,
}) {
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
                const active = isSameDay(day, selectedDate);
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
                  const cellItems = weekGridItems[String(day.getDay()) + '-' + String(hour)] || [];
                  let moreItemsNode = null;
                  if (cellItems.length > 2) {
                    moreItemsNode = (
                      <Text style={styles.weekMoreText}>+{cellItems.length - 2} more</Text>
                    );
                  }
                  return (
                    <Pressable
                      key={buildDateKey(day) + '-' + String(hour)}
                      onPress={() => setSelectedDate(day)}
                      style={[
                        styles.weekGridCell,
                        getStyleWhen(isSameDay(day, selectedDate), styles.weekGridCellSelected),
                        getStyleWhen(isSameDay(day, new Date()), styles.weekGridCellToday),
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

    let calendarPanelNode = null;
    if (selectedPanel === 'calendar') {
      calendarPanelNode = (
        <>
          <View style={styles.previewFocusRow}>
            <View style={styles.focusTodayCard}>
              <Text style={styles.focusTodayLabel}>TODAY</Text>
              <Text style={styles.focusTodayDate}>{formatDayMonth(new Date())}</Text>
              <Text style={styles.focusTodayMeta}>
                {getNextUpcomingLabel(nextUpcomingItem)}
              </Text>
            </View>

            <MiniCalendarPanel
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
    }

  return calendarPanelNode;
}

export function CalendarTasksPanel({
  showTaskSection,
  taskForm,
  editingTaskId,
  taskSaving,
  tasksError,
  tasksLoading,
  customTasks,
  taskDeletingId,
  taskTogglingId,
  selectedDate,
  resetTaskComposer,
  handleTaskFieldChange,
  openTaskDatePicker,
  openTimePicker,
  handleSubmitTask,
  handleToggleTaskCompletion,
  handleEditTask,
  handleDeleteTask,
}) {
    let taskTimeFieldsNode = (
      <>
        <TaskSelectField
          label="Start"
          value={formatTimeOnly(taskForm.startTime)}
          hint="00 / 15 / 30 / 45"
          onPress={() => openTimePicker('startTime')}
        />
        <TaskSelectField
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
          label="Due time"
          value={formatTimeOnly(taskForm.dueTime)}
          hint="00 / 15 / 30 / 45"
          onPress={() => openTimePicker('dueTime')}
        />
      );
    }

    let taskSaveButtonNode = (
      <Text style={styles.taskSaveBtnText}>
        {getTaskSaveButtonText(editingTaskId)}
      </Text>
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
                  {isToggling ? (
                    <ActivityIndicator size="small" color={task.isCompleted ? '#fff' : '#2563eb'} />
                  ) : (
                    <Text
                      style={[
                        styles.taskCheckBtnText,
                        getStyleWhen(task.isCompleted, styles.taskCheckBtnTextActive),
                      ]}
                    >
                      {getTextWhen(task.isCompleted, '\u2713', '')}
                    </Text>
                  )}
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

    let taskSectionNode = null;
    if (showTaskSection) {
      taskSectionNode = (
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
    }

  return taskSectionNode;
}
