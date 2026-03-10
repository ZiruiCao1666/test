import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useAuth } from '@clerk/clerk-expo';

const PAGE_SIZE = 50;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const SAVE_DEBOUNCE_MS = 450;

const normalizeBaseUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
};

const buildBaseUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('.') || /^https?:\/\//i.test(trimmed)) {
    return normalizeBaseUrl(trimmed);
  }
  return `https://${trimmed}.instructure.com`;
};

const formatDateTime = (isoString) => {
  if (!isoString) return 'No due date';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
};

const formatPercent = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
  return `${Math.round(value * 100)}%`;
};

const parseNumber = (value) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return null;
};

const formatScoreValue = (score, pointsPossible) => {
  const safeScore = parseNumber(score);
  const safePoints = parseNumber(pointsPossible);
  if (safeScore === null && safePoints === null) return 'N/A';
  if (safeScore !== null && safePoints !== null) return `${safeScore} / ${safePoints}`;
  if (safeScore !== null) return `${safeScore} / N/A`;
  return `N/A / ${safePoints}`;
};

const parseLinkHeader = (header) => {
  if (!header) return {};
  return header.split(',').reduce((acc, part) => {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match) {
      acc[match[2]] = match[1];
    }
    return acc;
  }, {});
};

const sortByDueAt = (a, b) => {
  if (!a?.due_at && !b?.due_at) return 0;
  if (!a?.due_at) return 1;
  if (!b?.due_at) return -1;
  return new Date(a.due_at) - new Date(b.due_at);
};

const isDueWithinWindow = (assignment, nowTs) => {
  if (!assignment?.due_at) return false;
  const dueTs = new Date(assignment.due_at).getTime();
  if (Number.isNaN(dueTs)) return false;
  return dueTs >= nowTs - 7 * ONE_DAY_MS;
};

const isNewlyPublished = (assignment, nowTs) => {
  const publishedAt =
    assignment?.published_at || assignment?.created_at || assignment?.unlock_at;
  if (!publishedAt) return false;
  const publishedTs = new Date(publishedAt).getTime();
  if (Number.isNaN(publishedTs)) return false;
  return publishedTs >= nowTs - 14 * ONE_DAY_MS;
};

const partitionAssignments = (assignments, nowTs) => {
  const visibleItems = [];
  const collapsedItems = [];
  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    if (isDueWithinWindow(assignment, nowTs) || isNewlyPublished(assignment, nowTs)) {
      visibleItems.push(assignment);
      return;
    }
    collapsedItems.push(assignment);
  });
  return { visibleItems, collapsedItems };
};

const getSubmissionOrderKey = (submission) => {
  const attempt = Number(submission?.attempt || 0);
  const updated = new Date(
    submission?.graded_at || submission?.submitted_at || submission?.updated_at || 0
  ).getTime();
  return { attempt, updated };
};

const pickLatestSubmissions = (submissions) => {
  return (Array.isArray(submissions) ? submissions : []).reduce((acc, submission, index) => {
    const assignmentKey = String(
      submission?.assignment_id ?? submission?.assignment?.id ?? `idx_${index}`
    );
    const current = acc[assignmentKey];
    if (!current) {
      acc[assignmentKey] = submission;
      return acc;
    }

    const nextOrder = getSubmissionOrderKey(submission);
    const currentOrder = getSubmissionOrderKey(current);
    if (nextOrder.attempt > currentOrder.attempt) {
      acc[assignmentKey] = submission;
      return acc;
    }
    if (nextOrder.attempt === currentOrder.attempt && nextOrder.updated > currentOrder.updated) {
      acc[assignmentKey] = submission;
    }
    return acc;
  }, {});
};

const buildAssignmentDetailKey = (courseId, assignmentId) =>
  `${String(courseId)}:${String(assignmentId)}`;

export default function CalendarScreen() {
  const { getToken, isLoaded: authLoaded, isSignedIn } = useAuth();
  const [schoolInput, setSchoolInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [credentialsHydrated, setCredentialsHydrated] = useState(false);
  const [credentialLoadReady, setCredentialLoadReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastPersistedRef = useRef({ school: '', token: '' });
  const getTokenRef = useRef(getToken);

  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [events, setEvents] = useState([]);
  const [assignmentsByCourse, setAssignmentsByCourse] = useState({});
  const [expandedAssignmentsByCourse, setExpandedAssignmentsByCourse] = useState({});
  const [enrollmentsByCourse, setEnrollmentsByCourse] = useState({});
  const [submissionsByCourse, setSubmissionsByCourse] = useState({});
  const [submissionDetailsByAssignment, setSubmissionDetailsByAssignment] = useState({});
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const baseUrl = useMemo(() => buildBaseUrl(schoolInput), [schoolInput]);
  const isConnected = Boolean(profile) || courses.length > 0;
  const canPersistToBackend = Boolean(API_BASE_URL && authLoaded && isSignedIn);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const getSessionToken = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const token = await getTokenRef.current?.();
      if (token) return token;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return '';
  };

  const persistCredentialsToBackend = async (nextSchool, nextToken) => {
    const sessionToken = await getSessionToken();
    if (!sessionToken) {
      throw new Error('No Clerk session token available');
    }
    const response = await fetch(`${API_BASE_URL}/canvas/credentials`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        school: nextSchool,
        token: nextToken,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Failed to save credentials (HTTP ${response.status})`);
    }
  };

  useEffect(() => {
    let mounted = true;
    setCredentialsHydrated(false);
    setCredentialLoadReady(false);

    if (!canPersistToBackend) {
      setCredentialsHydrated(true);
      return () => {
        mounted = false;
      };
    }

    (async () => {
      try {
        const sessionToken = await getSessionToken();
        if (!sessionToken) {
          throw new Error('No Clerk session token available yet');
        }
        const response = await fetch(`${API_BASE_URL}/canvas/credentials`, {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || `Failed to load saved credentials (HTTP ${response.status})`);
        }
        if (!mounted) return;
        const nextSchool = String(data?.school || '');
        const nextToken = String(data?.token || '');
        setSchoolInput(nextSchool);
        setTokenInput(nextToken);
        lastPersistedRef.current = {
          school: nextSchool.trim(),
          token: nextToken.trim(),
        };
        setError('');
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? `Failed to load saved token from backend: ${loadError.message}`
              : 'Failed to load saved token from backend.'
          );
        }
      } finally {
        if (mounted) {
          setCredentialsHydrated(true);
          setCredentialLoadReady(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [canPersistToBackend]);

  useEffect(() => {
    if (!credentialsHydrated || !canPersistToBackend || !credentialLoadReady) return;
    const nextSchool = schoolInput.trim();
    const nextToken = tokenInput.trim();
    if (
      lastPersistedRef.current.school === nextSchool &&
      lastPersistedRef.current.token === nextToken
    ) {
      return;
    }
    const timer = setTimeout(() => {
      (async () => {
        try {
          await persistCredentialsToBackend(nextSchool, nextToken);
          lastPersistedRef.current = {
            school: nextSchool,
            token: nextToken,
          };
          setError('');
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? `Failed to save token to backend: ${saveError.message}`
              : 'Failed to save token to backend.'
          );
        }
      })();
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    credentialsHydrated,
    credentialLoadReady,
    canPersistToBackend,
    schoolInput,
    tokenInput,
  ]);

  const buildCanvasUrl = (pathOrUrl) => {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${baseUrl}${pathOrUrl}`;
  };

  const fetchCanvasPage = async (pathOrUrl) => {
    const response = await fetch(buildCanvasUrl(pathOrUrl), {
      headers: {
        Authorization: `Bearer ${tokenInput.trim()}`,
        Accept: 'application/json',
      },
    });

    const raw = await response.text();
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (parseError) {
        data = null;
      }
    }

    if (!response.ok) {
      const message =
        data?.errors?.[0]?.message || data?.message || response.statusText;
      throw new Error(`${response.status} ${message}`);
    }

    const links = parseLinkHeader(response.headers.get('Link'));
    return { data, nextUrl: links.next || '' };
  };

  const fetchCanvasPaged = async (path) => {
    let nextUrl = path;
    const aggregated = [];
    const visited = new Set();

    while (nextUrl) {
      if (visited.has(nextUrl)) break;
      visited.add(nextUrl);

      const { data, nextUrl: newNextUrl } = await fetchCanvasPage(nextUrl);
      if (!Array.isArray(data)) return data;

      aggregated.push(...data);
      nextUrl = newNextUrl;
    }

    return aggregated;
  };

  const fetchCanvasObject = async (path) => {
    const { data } = await fetchCanvasPage(path);
    return data;
  };

  const openUrl = async (url) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (linkError) {
      setError('Cannot open this Canvas URL on the current device.');
    }
  };

  const handleClear = async () => {
    setProfile(null);
    setCourses([]);
    setEvents([]);
    setAssignmentsByCourse({});
    setExpandedAssignmentsByCourse({});
    setEnrollmentsByCourse({});
    setSubmissionsByCourse({});
    setSubmissionDetailsByAssignment({});
    setError('');
    setSchoolInput('');
    setTokenInput('');
    setLastSyncAt(null);
    try {
      if (!canPersistToBackend) return;
      const sessionToken = await getSessionToken();
      if (!sessionToken) return;
      const response = await fetch(`${API_BASE_URL}/canvas/credentials`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Failed to clear credentials (HTTP ${response.status})`);
      }
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? `Failed to clear saved token from backend: ${clearError.message}`
          : 'Failed to clear saved token from backend.'
      );
    }
  };

  const fetchSingleSubmissionDetail = async (courseId, assignmentId) => {
    const params = new URLSearchParams();
    params.append('include[]', 'submission_comments');
    params.append('include[]', 'submission_history');
    return fetchCanvasObject(
      `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self?${params.toString()}`
    );
  };

  const handleToggleSubmissionDetail = async (courseId, assignmentId) => {
    const detailKey = buildAssignmentDetailKey(courseId, assignmentId);
    const current = submissionDetailsByAssignment[detailKey] || {};

    if (current.expanded) {
      setSubmissionDetailsByAssignment((prev) => ({
        ...prev,
        [detailKey]: {
          ...current,
          expanded: false,
        },
      }));
      return;
    }

    if (current.data && !current.error) {
      setSubmissionDetailsByAssignment((prev) => ({
        ...prev,
        [detailKey]: {
          ...current,
          expanded: true,
        },
      }));
      return;
    }

    setSubmissionDetailsByAssignment((prev) => ({
      ...prev,
      [detailKey]: {
        ...current,
        expanded: true,
        loading: true,
        error: '',
      },
    }));

    try {
      const detail = await fetchSingleSubmissionDetail(courseId, assignmentId);
      setSubmissionDetailsByAssignment((prev) => ({
        ...prev,
        [detailKey]: {
          expanded: true,
          loading: false,
          error: '',
          data: detail,
        },
      }));
    } catch (detailError) {
      setSubmissionDetailsByAssignment((prev) => ({
        ...prev,
        [detailKey]: {
          ...prev[detailKey],
          expanded: true,
          loading: false,
          error:
            detailError instanceof Error
              ? detailError.message
              : 'Failed to load submission detail.',
        },
      }));
    }
  };

  const handleConnect = async () => {
    if (!baseUrl || !tokenInput.trim()) {
      setError('Please fill in school name and access token first.');
      return;
    }

    if (canPersistToBackend) {
      try {
        await persistCredentialsToBackend(schoolInput.trim(), tokenInput.trim());
        lastPersistedRef.current = {
          school: schoolInput.trim(),
          token: tokenInput.trim(),
        };
      } catch (persistError) {
        setError(
          persistError instanceof Error
            ? `Cannot save token before sync: ${persistError.message}`
            : 'Cannot save token before sync.'
        );
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const [profileData, coursesData, eventsData] = await Promise.all([
        fetchCanvasObject('/api/v1/users/self/profile'),
        fetchCanvasPaged(
          `/api/v1/courses?enrollment_type=student&enrollment_state=active&include[]=term&per_page=${PAGE_SIZE}`
        ),
        fetchCanvasPaged(`/api/v1/users/self/upcoming_events?per_page=${PAGE_SIZE}`),
      ]);

      const safeCourses = Array.isArray(coursesData) ? coursesData : [];
      const safeEvents = Array.isArray(eventsData) ? eventsData : [];

      const perCoursePayload = await Promise.all(
        safeCourses.map(async (course) => {
          const courseId = String(course.id);
          try {
            const [enrollmentList, assignmentList, submissionList] = await Promise.all([
              fetchCanvasPaged(
                `/api/v1/courses/${courseId}/enrollments?user_id=self&type[]=StudentEnrollment&state[]=active&include[]=current_points&per_page=${PAGE_SIZE}`
              ),
              fetchCanvasPaged(`/api/v1/courses/${courseId}/assignments?per_page=${PAGE_SIZE}`),
              fetchCanvasPaged(
                `/api/v1/courses/${courseId}/students/submissions?student_ids[]=self&include[]=assignment&per_page=${PAGE_SIZE}`
              ),
            ]);

            return {
              courseId,
              enrollments: Array.isArray(enrollmentList) ? enrollmentList : [],
              assignments: Array.isArray(assignmentList) ? assignmentList : [],
              submissions: Array.isArray(submissionList) ? submissionList : [],
            };
          } catch (courseError) {
            return {
              courseId,
              enrollments: [],
              assignments: [],
              submissions: [],
            };
          }
        })
      );

      const assignmentsMap = {};
      const enrollmentsMap = {};
      const submissionsMap = {};

      perCoursePayload.forEach((entry) => {
        const courseId = entry.courseId;
        const sortedAssignments = entry.assignments.slice().sort(sortByDueAt);
        assignmentsMap[courseId] = {
          items: sortedAssignments,
        };

        const enrollment = entry.enrollments[0] || null;
        enrollmentsMap[courseId] = enrollment;

        const latestByAssignment = pickLatestSubmissions(entry.submissions);
        const latestSubmissions = Object.values(latestByAssignment);

        const assignmentCount = sortedAssignments.length;
        const submittedCount = latestSubmissions.filter((item) => item?.submitted_at).length;
        const onTimeCount = latestSubmissions.filter(
          (item) => item?.submitted_at && !item?.late
        ).length;

        submissionsMap[courseId] = {
          items: latestSubmissions,
          byAssignment: latestByAssignment,
          summary: {
            assignmentCount,
            submittedCount,
            completionRate: assignmentCount ? submittedCount / assignmentCount : null,
            onTimeRate: submittedCount ? onTimeCount / submittedCount : null,
          },
        };
      });

      const normalizedEvents = safeEvents
        .map((item, index) => {
          const date = item?.due_at || item?.start_at || item?.end_at || null;
          return {
            id: String(item?.id || item?.event_id || item?.assignment_id || index),
            title: item?.title || item?.name || 'Untitled event',
            course: item?.context_name || item?.assignment?.course_name || '',
            type: item?.type || item?.assignment?.type || 'event',
            date,
            htmlUrl: item?.html_url || item?.assignment?.html_url || '',
          };
        })
        .sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return new Date(a.date) - new Date(b.date);
        });

      setProfile(profileData || null);
      setCourses(safeCourses);
      setEvents(normalizedEvents);
      setAssignmentsByCourse(assignmentsMap);
      setExpandedAssignmentsByCourse({});
      setEnrollmentsByCourse(enrollmentsMap);
      setSubmissionsByCourse(submissionsMap);
      setSubmissionDetailsByAssignment({});
      setLastSyncAt(new Date());
    } catch (err) {
      setError(
        err instanceof Error
          ? `Connection failed: ${err.message}`
          : 'Connection failed. Check network and token.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Calendar + Grades</Text>
          <Text style={styles.subtitle}>
            School name only. We build your Canvas host as
            {' '}
            <Text style={styles.subtitleStrong}>https://school.instructure.com</Text>
            .
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>School name</Text>
          <TextInput
            value={schoolInput}
            onChangeText={setSchoolInput}
            placeholder="Example: hull / ox"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={styles.inputHint}>
            Resolved URL:
            {' '}
            {baseUrl || 'https://school-name.instructure.com'}
          </Text>

          <Text style={[styles.label, { marginTop: 12 }]}>Access Token</Text>
          <TextInput
            value={tokenInput}
            onChangeText={setTokenInput}
            placeholder="Canvas Access Token"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={styles.input}
          />

          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleConnect}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isConnected ? 'Resync Canvas' : 'Connect Canvas'}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [
                styles.ghostBtn,
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              <Text style={styles.ghostBtnText}>Clear</Text>
            </Pressable>
          </View>

          <Text style={styles.helper}>
            {canPersistToBackend
              ? 'Token is saved to your backend account storage and auto-loaded when you open the app.'
              : 'Backend token storage is unavailable. Set EXPO_PUBLIC_API_URL and sign in first.'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {lastSyncAt ? (
            <Text style={styles.sync}>
              Last sync:
              {' '}
              {lastSyncAt.toLocaleString()}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          {!profile ? (
            <Text style={styles.empty}>No profile synced yet.</Text>
          ) : (
            <View style={styles.profileCard}>
              <Text style={styles.profileName}>{profile?.name || 'Unknown user'}</Text>
              {profile?.primary_email || profile?.login_id ? (
                <Text style={styles.profileMeta}>
                  Email/Login:
                  {' '}
                  {profile?.primary_email || profile?.login_id}
                </Text>
              ) : null}
              {profile?.time_zone ? (
                <Text style={styles.profileMeta}>
                  Time zone:
                  {' '}
                  {profile.time_zone}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Course Grades</Text>
          {courses.length === 0 ? (
            <Text style={styles.empty}>No courses synced.</Text>
          ) : (
            <View style={styles.events}>
              {courses.map((course, courseIndex) => {
                const courseId = String(course.id);
                const enrollment = enrollmentsByCourse[courseId];
                const grades = enrollment?.grades || {};
                const submissionSummary = submissionsByCourse[courseId]?.summary;
                const termName = course?.term?.name || 'No term';
                const completionText = formatPercent(submissionSummary?.completionRate);
                const onTimeText = formatPercent(submissionSummary?.onTimeRate);

                return (
                  <View key={`${courseId}-grade-${courseIndex}`} style={styles.gradeCard}>
                    <Text style={styles.gradeCourseName}>
                      {course.name || course.course_code || 'Untitled course'}
                    </Text>
                    <Text style={styles.gradeMeta}>Term: {termName}</Text>
                    <Text style={styles.gradeMeta}>Completion: {completionText}</Text>
                    <Text style={styles.gradeMeta}>On-time: {onTimeText}</Text>
                    {grades?.html_url ? (
                      <Pressable
                        onPress={() => openUrl(grades.html_url)}
                        style={({ pressed }) => [
                          styles.inlineLinkBtn,
                          pressed ? { opacity: 0.7 } : null,
                        ]}
                      >
                        <Text style={styles.inlineLinkText}>Open grade page</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Due Soon</Text>
          {events.length === 0 ? (
            <Text style={styles.empty}>No upcoming events.</Text>
          ) : (
            <View style={styles.events}>
              {events.map((event, eventIndex) => (
                <Pressable
                  key={`${String(event.id)}-event-${eventIndex}`}
                  onPress={() => openUrl(event.htmlUrl)}
                  style={({ pressed }) => [
                    styles.eventItem,
                    event.htmlUrl ? styles.eventClickable : null,
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  <View style={styles.eventTag}>
                    <Text style={styles.eventTagText}>{event.type}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    {event.course ? <Text style={styles.eventCourse}>{event.course}</Text> : null}
                    <Text style={styles.eventDate}>{formatDateTime(event.date)}</Text>
                    {event.htmlUrl ? <Text style={styles.eventLink}>Open in Canvas</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assignments + Scores</Text>
          {courses.length === 0 ? (
            <Text style={styles.empty}>No assignment data yet.</Text>
          ) : (
            courses.map((course, courseIndex) => {
              const courseId = String(course.id);
              const assignmentEntry = assignmentsByCourse[courseId];
              const assignments = assignmentEntry?.items || [];
              const submissionLookup = submissionsByCourse[courseId]?.byAssignment || {};
              const nowTs = Date.now();
              const { visibleItems, collapsedItems } = partitionAssignments(assignments, nowTs);
              const isExpanded = Boolean(expandedAssignmentsByCourse[courseId]);
              const displayItems = isExpanded
                ? [...visibleItems, ...collapsedItems]
                : visibleItems;

              return (
                <View key={`${courseId}-assignment-group-${courseIndex}`} style={styles.assignmentGroup}>
                  <Text style={styles.assignmentCourseName}>
                    {course.name || course.course_code || 'Untitled course'}
                  </Text>
                  {assignments.length === 0 ? (
                    <Text style={styles.empty}>No assignments in this course.</Text>
                  ) : (
                    <View style={styles.assignments}>
                      {displayItems.length === 0 ? (
                        <Text style={styles.assignmentHint}>
                          No assignments in current window. Expand to see all.
                        </Text>
                      ) : null}
                      {displayItems.map((assignment, assignmentIndex) => {
                        const submission =
                          submissionLookup[String(assignment.id)] || null;
                        const scoreText = formatScoreValue(
                          submission?.score,
                          assignment?.points_possible
                        );
                        const detailKey = buildAssignmentDetailKey(courseId, assignment.id);
                        const detailState = submissionDetailsByAssignment[detailKey] || {};
                        const detailData = detailState.data || null;
                        const detailComments = Array.isArray(detailData?.submission_comments)
                          ? detailData.submission_comments
                          : [];
                        const currentUserId =
                          profile?.id === null || profile?.id === undefined
                            ? ''
                            : String(profile.id);
                        const teacherComments = detailComments.filter(
                          (comment) =>
                            !currentUserId ||
                            String(comment?.author_id === undefined ? '' : comment.author_id) !==
                              currentUserId
                        );
                        const detailHistory = Array.isArray(detailData?.submission_history)
                          ? detailData.submission_history
                          : [];
                        return (
                          <View
                            key={`${courseId}-assignment-${String(assignment.id)}-${assignmentIndex}`}
                            style={[
                              styles.assignmentItem,
                              assignment?.html_url ? styles.eventClickable : null,
                            ]}
                          >
                            <Text style={styles.assignmentTitle}>
                              {assignment?.name || 'Untitled assignment'}
                            </Text>
                            <Text style={styles.assignmentMeta}>
                              Due:
                              {' '}
                              {formatDateTime(assignment?.due_at)}
                            </Text>
                            <Text style={styles.assignmentMeta}>
                              Score: {scoreText}
                            </Text>
                            <Text style={styles.assignmentMeta}>
                              Status:
                              {' '}
                              {submission?.submitted_at ? 'Submitted' : 'Not submitted'}
                              {submission?.late ? ' (Late)' : ''}
                            </Text>
                            <Pressable
                              onPress={() =>
                                handleToggleSubmissionDetail(courseId, assignment.id)
                              }
                              style={({ pressed }) => [
                                styles.detailBtn,
                                pressed ? { opacity: 0.7 } : null,
                              ]}
                            >
                              <Text style={styles.detailBtnText}>
                                {detailState.loading
                                  ? 'Loading detail...'
                                  : detailState.expanded
                                    ? 'Hide submission detail'
                                    : 'View submission detail'}
                              </Text>
                            </Pressable>
                            {detailState.expanded ? (
                              <View style={styles.detailPanel}>
                                {detailState.error ? (
                                  <Text style={styles.detailError}>
                                    Failed to load detail: {detailState.error}
                                  </Text>
                                ) : null}
                                {detailData ? (
                                  <>
                                    <Text style={styles.detailMeta}>
                                      Late: {detailData?.late ? 'Yes' : 'No'}
                                    </Text>
                                    <Text style={styles.detailMeta}>
                                      Submitted at: {formatDateTime(detailData?.submitted_at)}
                                    </Text>
                                    <Text style={styles.detailHeading}>Teacher comments</Text>
                                    {teacherComments.length === 0 ? (
                                      <Text style={styles.detailMuted}>No teacher comments yet.</Text>
                                    ) : (
                                      teacherComments.map((comment, index) => (
                                        <View
                                          key={`${courseId}-assignment-${String(assignment.id)}-comment-${String(comment?.id || 'x')}-${index}`}
                                          style={styles.detailRow}
                                        >
                                          <Text style={styles.detailMeta}>
                                            {comment?.author_name || 'Instructor'}
                                            {' | '}
                                            {formatDateTime(comment?.created_at)}
                                          </Text>
                                          <Text style={styles.detailText}>
                                            {comment?.comment || '-'}
                                          </Text>
                                        </View>
                                      ))
                                    )}
                                    <Text style={styles.detailHeading}>Attempt history</Text>
                                    {detailHistory.length === 0 ? (
                                      <Text style={styles.detailMuted}>No attempt history.</Text>
                                    ) : (
                                      detailHistory.map((attempt, index) => (
                                        <View
                                          key={`${courseId}-assignment-${String(assignment.id)}-attempt-${String(attempt?.id || attempt?.attempt || 'x')}-${index}`}
                                          style={styles.detailRow}
                                        >
                                          <Text style={styles.detailMeta}>
                                            Attempt {attempt?.attempt ?? index + 1}
                                          </Text>
                                          <Text style={styles.detailText}>
                                            Submitted: {formatDateTime(attempt?.submitted_at)}
                                          </Text>
                                          <Text style={styles.detailText}>
                                            Late: {attempt?.late ? 'Yes' : 'No'}
                                          </Text>
                                          <Text style={styles.detailText}>
                                            Score:
                                            {' '}
                                            {formatScoreValue(
                                              attempt?.score,
                                              attempt?.points_possible ?? assignment?.points_possible
                                            )}
                                          </Text>
                                        </View>
                                      ))
                                    )}
                                  </>
                                ) : (
                                  <Text style={styles.detailMuted}>
                                    {detailState.loading
                                      ? 'Loading detail...'
                                      : 'No detail loaded yet.'}
                                  </Text>
                                )}
                              </View>
                            ) : null}
                            {assignment?.html_url ? (
                              <Pressable
                                onPress={() => openUrl(assignment?.html_url)}
                                style={({ pressed }) => [
                                  styles.inlineLinkBtn,
                                  pressed ? { opacity: 0.7 } : null,
                                ]}
                              >
                                <Text style={styles.inlineLinkText}>Open assignment</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        );
                      })}
                      {collapsedItems.length > 0 ? (
                        <Pressable
                          onPress={() =>
                            setExpandedAssignmentsByCourse((prev) => ({
                              ...prev,
                              [courseId]: !isExpanded,
                            }))
                          }
                          style={({ pressed }) => [
                            styles.collapseBtn,
                            pressed ? { opacity: 0.7 } : null,
                          ]}
                        >
                          <Text style={styles.collapseBtnText}>
                            {isExpanded
                              ? 'Collapse old or no-due assignments'
                              : `Show ${collapsedItems.length} old or no-due assignments`}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { paddingHorizontal: 18, paddingTop: 12 },

  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 6, fontSize: 12, color: '#6b7280' },
  subtitleStrong: { color: '#111827', fontWeight: '700' },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  label: { fontSize: 12, fontWeight: '700', color: '#374151' },
  input: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  inputHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#6b7280',
  },
  buttonRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: '#111827', fontWeight: '700', fontSize: 13 },
  helper: { marginTop: 10, fontSize: 11, color: '#9ca3af' },
  error: { marginTop: 8, fontSize: 12, color: '#ef4444' },
  sync: { marginTop: 8, fontSize: 11, color: '#6b7280' },

  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 10,
  },
  empty: { fontSize: 12, color: '#9ca3af' },

  profileCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 12,
  },
  profileName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  profileMeta: { marginTop: 5, fontSize: 12, color: '#4b5563' },

  events: { gap: 10 },
  gradeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 12,
  },
  gradeCourseName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  gradeMeta: { marginTop: 6, fontSize: 11, color: '#374151' },
  inlineLinkBtn: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'flex-start',
  },
  inlineLinkText: { fontSize: 11, fontWeight: '700', color: '#111827' },

  eventItem: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  eventClickable: { borderColor: '#111827' },
  eventTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
  },
  eventTagText: { fontSize: 10, fontWeight: '700', color: '#374151' },
  eventTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  eventCourse: { marginTop: 4, fontSize: 11, color: '#6b7280' },
  eventDate: { marginTop: 6, fontSize: 11, color: '#111827' },
  eventLink: { marginTop: 5, fontSize: 10, color: '#4b5563' },

  assignmentGroup: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  assignmentCourseName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  assignments: { gap: 10 },
  assignmentItem: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  assignmentTitle: { fontSize: 12, fontWeight: '700', color: '#111827' },
  assignmentMeta: { marginTop: 4, fontSize: 11, color: '#374151' },
  detailBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
  },
  detailBtnText: { fontSize: 11, fontWeight: '700', color: '#111827' },
  detailPanel: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 8,
    gap: 6,
  },
  detailHeading: { fontSize: 11, fontWeight: '700', color: '#111827', marginTop: 2 },
  detailRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 6,
    backgroundColor: '#f9fafb',
  },
  detailMeta: { fontSize: 10, color: '#4b5563' },
  detailText: { marginTop: 3, fontSize: 11, color: '#111827' },
  detailMuted: { fontSize: 11, color: '#6b7280' },
  detailError: { fontSize: 11, color: '#ef4444' },
  assignmentHint: { fontSize: 11, color: '#6b7280' },
  collapseBtn: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  collapseBtnText: { fontSize: 11, fontWeight: '700', color: '#111827' },
});
