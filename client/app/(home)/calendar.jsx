import React, { useMemo, useState } from 'react';
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
  if (!isoString) return 'no due date';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
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

export default function CalendarScreen() {
  const [schoolInput, setSchoolInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState([]);
  const [events, setEvents] = useState([]);
  const [assignmentsByCourse, setAssignmentsByCourse] = useState({});
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const baseUrl = useMemo(() => buildBaseUrl(schoolInput), [schoolInput]);

  const isConnected = courses.length > 0 || events.length > 0;

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

      if (!Array.isArray(data)) {
        return data;
      }

      aggregated.push(...data);
      nextUrl = newNextUrl;
    }

    return aggregated;
  };

  const handleConnect = async () => {
    if (!baseUrl || !tokenInput.trim()) {
      setError('Please first fill in the school abbreviation and Access Token in Canvas.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [coursesData, eventsData] = await Promise.all([
        fetchCanvasPaged('/api/v1/courses?per_page=50'),
        fetchCanvasPaged('/api/v1/users/self/upcoming_events?per_page=50'),
      ]);

      const safeCourses = Array.isArray(coursesData) ? coursesData : [];
      const safeEvents = Array.isArray(eventsData) ? eventsData : [];

      const assignmentsResponses = await Promise.all(
        safeCourses.map(async (course) => {
          try {
            const items = await fetchCanvasPaged(
              `/api/v1/courses/${course.id}/assignments?per_page=50`
            );
            const itemsArray = Array.isArray(items) ? items : [];
            const sortedItems = itemsArray.slice().sort((a, b) => {
              if (!a?.due_at && !b?.due_at) return 0;
              if (!a?.due_at) return 1;
              if (!b?.due_at) return -1;
              return new Date(a.due_at) - new Date(b.due_at);
            });
            return {
              courseId: String(course.id),
              courseName: course.name || course.course_code || 'untitled course',
              items: sortedItems,
            };
          } catch (innerError) {
            return {
              courseId: String(course.id),
              courseName: course.name || course.course_code || 'untitled course',
              items: [],
            };
          }
        })
      );

      const normalizedEvents = safeEvents
        .map((item, index) => {
          const date = item.due_at || item.start_at || item.end_at || null;
          return {
            id: String(item.id || item.event_id || item.assignment_id || index),
            title: item.title || item.name || 'untitled event',
            course: item.context_name || item?.assignment?.course_name || '',
            type: item.type || item?.assignment?.type || 'event',
            date,
            htmlUrl: item.html_url || item?.assignment?.html_url || '',
          };
        })
        .sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return new Date(a.date) - new Date(b.date);
        });

      const assignmentsMap = assignmentsResponses.reduce((acc, entry) => {
        acc[entry.courseId] = entry;
        return acc;
      }, {});

      setCourses(safeCourses);
      setEvents(normalizedEvents);
      setAssignmentsByCourse(assignmentsMap);
      setLastSyncAt(new Date());
    } catch (err) {
      setError(
        err instanceof Error
          ? `连接失败：${err.message}`
          : '连接失败，请检查网络或 Token'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Calendar with Canvas</Text>
          <Text style={styles.subtitle}>
            Please first input the school abbreviation and access token in Canvas to rapidly synchronize the course and assignment deadlines.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Canvas school abbreviation</Text>
          <TextInput
            value={schoolInput}
            onChangeText={setSchoolInput}
            placeholder="Example: hull / ox"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={styles.inputHint}>
            We will build https://school-name.instructure.com automatically.
          </Text>

          <Text style={[styles.label, { marginTop: 12 }]}>
            Access Token
          </Text>
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
                  {isConnected ? 'try again' : 'Connect Canvas'}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                setCourses([]);
                setEvents([]);
                setAssignmentsByCourse({});
                setError('');
                setLastSyncAt(null);
              }}
              style={({ pressed }) => [
                styles.ghostBtn,
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              <Text style={styles.ghostBtnText}>Clean</Text>
            </Pressable>
          </View>

          <Text style={styles.helper}>
            yes
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {lastSyncAt ? (
            <Text style={styles.sync}>
              Last synchronization：{lastSyncAt.toLocaleString()}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>classes</Text>
          {courses.length === 0 ? (
            <Text style={styles.empty}>There is no course data available for the moment.</Text>
          ) : (
            <View style={styles.grid}>
              {courses.map((course) => (
                <View key={String(course.id)} style={styles.courseCard}>
                  <Text style={styles.courseName}>
                    {course.name || 'untitled course'}
                  </Text>
                  <Text style={styles.courseCode}>
                    {course.course_code || 'course code'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>due soon</Text>
          {events.length === 0 ? (
            <Text style={styles.empty}>There is no upcoming assignment or event.</Text>
          ) : (
            <View style={styles.events}>
              {events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => {
                    if (event.htmlUrl) {
                      Linking.openURL(event.htmlUrl);
                    }
                  }}
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
                    {event.course ? (
                      <Text style={styles.eventCourse}>{event.course}</Text>
                    ) : null}
                    <Text style={styles.eventDate}>
                      {formatDateTime(event.date)}
                    </Text>
                    {event.htmlUrl ? (
                      <Text style={styles.eventLink}>Click to open</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>assignments</Text>
          {courses.length === 0 ? (
            <Text style={styles.empty}>There is no assignment data available for the moment.</Text>
          ) : (
            courses.map((course) => {
              const entry = assignmentsByCourse[String(course.id)];
              const items = entry?.items || [];

              return (
                <View key={String(course.id)} style={styles.assignmentGroup}>
                  <Text style={styles.assignmentCourseName}>
                    {course.name || course.course_code || 'untitled course'}
                  </Text>
                  {items.length === 0 ? (
                    <Text style={styles.empty}>暂无作业</Text>
                  ) : (
                    <View style={styles.assignments}>
                      {items.map((assignment) => (
                        <Pressable
                          key={String(assignment.id)}
                          onPress={() => {
                            if (assignment.html_url) {
                              Linking.openURL(assignment.html_url);
                            }
                          }}
                          style={({ pressed }) => [
                            styles.assignmentItem,
                            assignment.html_url ? styles.eventClickable : null,
                            pressed ? { opacity: 0.7 } : null,
                          ]}
                        >
                          <Text style={styles.assignmentTitle}>
                            {assignment.name || 'untitled assignment'}
                          </Text>
                          <Text style={styles.assignmentDate}>
                            {formatDateTime(assignment.due_at)}
                          </Text>
                          {assignment.html_url ? (
                            <Text style={styles.eventLink}>Click to go to the detailed page.</Text>
                          ) : null}
                        </Pressable>
                      ))}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  courseCard: {
    width: '48%',
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    backgroundColor: '#fff',
  },
  courseName: { fontSize: 12, fontWeight: '700', color: '#111827' },
  courseCode: { marginTop: 6, fontSize: 11, color: '#6b7280' },

  events: { gap: 10 },
  eventItem: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  eventClickable: {
    borderColor: '#111827',
  },
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
  eventLink: { marginTop: 4, fontSize: 10, color: '#4b5563' },

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
  assignmentDate: { marginTop: 6, fontSize: 11, color: '#111827' },
});
