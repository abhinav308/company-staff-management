import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { errorMessage } from '../../src/services/api';

interface AdminSummary {
  total_users: number;
  active_users: number;
  currently_tracking: number;
  location_unavailable: number;
  paused_offline?: number;
  today_punch_ins: number;
  today_punch_outs: number;
  completed_sessions: number;
  today_visits: number;
}

interface LiveOfficer {
  session_id: number;
  user_id: number;
  display_name: string;
  status: string;
  tracking_status: string;
  latitude: number | null;
  longitude: number | null;
  last_location_at: string | null;
  punch_in_at: string;
  accuracy: number | null;
}

interface AdminSession {
  id: number;
  user: number;
  display_name: string;
  employee_id: string;
  department: string;
  status: string;
  tracking_status: string;
  punch_in_at: string;
  punch_out_at: string | null;
  duration_seconds: number;
  interruptions: number;
  last_latitude?: number | null;
  last_longitude?: number | null;
}

interface AdminUserItem {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: string;
  display_name?: string;
  profile?: {
    employee_id: string;
    designation: string;
    department: string;
    office: string;
    phone?: string;
  };
}

export default function AdminScreen() {
  const [activeSegment, setActiveSegment] = useState<'live' | 'sessions' | 'officers'>('live');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [liveOfficers, setLiveOfficers] = useState<LiveOfficer[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [officers, setOfficers] = useState<AdminUserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fetchAdminData = async () => {
    try {
      // 1. Fetch Summary
      try {
        const sumRes = await api.get<AdminSummary>('/admin/summary/');
        setSummary(sumRes.data);
      } catch (err: any) {
        console.warn('Summary error:', err);
      }

      // 2. Fetch Live Officers
      try {
        const liveRes = await api.get<any>('/admin/live/');
        const liveData = Array.isArray(liveRes.data)
          ? liveRes.data
          : Array.isArray(liveRes.data?.results)
          ? liveRes.data.results
          : liveRes.data?.session_id
          ? [liveRes.data]
          : [];
        setLiveOfficers(liveData);
      } catch (err: any) {
        console.warn('Live tracking error:', err);
      }

      // 3. Fetch Sessions
      try {
        const sessRes = await api.get<any>('/admin/sessions/?page_size=20');
        const sessData = Array.isArray(sessRes.data)
          ? sessRes.data
          : Array.isArray(sessRes.data?.results)
          ? sessRes.data.results
          : [];
        setSessions(sessData);
      } catch (err: any) {
        console.warn('Sessions error:', err);
      }

      // 4. Fetch Users Directory
      try {
        const usersRes = await api.get<any>('/admin/users/');
        const usersData = Array.isArray(usersRes.data)
          ? usersRes.data
          : Array.isArray(usersRes.data?.results)
          ? usersRes.data.results
          : [];
        setOfficers(usersData);
      } catch (err: any) {
        console.warn('Users directory error:', err);
      }
    } catch (err: any) {
      setErrorMsg(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await fetchAdminData();
      } catch (e) {
        // handled in fetchAdminData
      }
    })();
    const interval = setInterval(fetchAdminData, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAdminData();
  };

  const formatDuration = (totalSeconds: number): string => {
    if (!totalSeconds) return '--';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const filteredSessions = sessions.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.display_name?.toLowerCase().includes(q) ||
      s.employee_id?.toLowerCase().includes(q) ||
      s.department?.toLowerCase().includes(q)
    );
  });

  const filteredOfficers = officers.filter(o => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const fullName = `${o.first_name} ${o.last_name}`.toLowerCase();
    return (
      o.username.toLowerCase().includes(q) ||
      fullName.includes(q) ||
      o.profile?.employee_id?.toLowerCase().includes(q) ||
      o.profile?.designation?.toLowerCase().includes(q)
    );
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
    >
      {/* Admin Header Banner */}
      <View style={styles.headerCard}>
        <View style={styles.headerBadgeRow}>
          <View style={styles.adminRolePill}>
            <Ionicons name="shield-checkmark" size={14} color="#059669" />
            <Text style={styles.adminRoleText}>ADMINISTRATOR PORTAL</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={18} color="#059669" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Operations Command Center</Text>
        <Text style={styles.headerSub}>Real-time monitoring, live field officers & duty logs</Text>
      </View>

      {errorMsg ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color="#b91c1c" />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Metric Cards Grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: '#059669' }]}>
          <View style={styles.statIconWrap}>
            <Ionicons name="radio" size={18} color="#059669" />
          </View>
          <Text style={styles.statValue}>{summary?.currently_tracking ?? liveOfficers.length}</Text>
          <Text style={styles.statLabel}>Tracking Live</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: '#0284c7' }]}>
          <View style={styles.statIconWrap}>
            <Ionicons name="people" size={18} color="#0284c7" />
          </View>
          <Text style={styles.statValue}>{summary?.active_users ?? liveOfficers.length}</Text>
          <Text style={styles.statLabel}>Active Duty</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: '#d97706' }]}>
          <View style={styles.statIconWrap}>
            <Ionicons name="warning-outline" size={18} color="#d97706" />
          </View>
          <Text style={styles.statValue}>{summary?.location_unavailable ?? 0}</Text>
          <Text style={styles.statLabel}>Location Lost</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: '#64748b' }]}>
          <View style={styles.statIconWrap}>
            <Ionicons name="checkmark-done-circle" size={18} color="#64748b" />
          </View>
          <Text style={styles.statValue}>{summary?.completed_sessions ?? sessions.length}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
      </View>

      {/* Segmented Control Tabs */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'live' && styles.segmentBtnActive]}
          onPress={() => setActiveSegment('live')}
        >
          <Ionicons
            name="navigate-outline"
            size={16}
            color={activeSegment === 'live' ? '#059669' : '#64748b'}
          />
          <Text style={[styles.segmentText, activeSegment === 'live' && styles.segmentTextActive]}>
            Live Field ({liveOfficers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'sessions' && styles.segmentBtnActive]}
          onPress={() => setActiveSegment('sessions')}
        >
          <Ionicons
            name="time-outline"
            size={16}
            color={activeSegment === 'sessions' ? '#059669' : '#64748b'}
          />
          <Text style={[styles.segmentText, activeSegment === 'sessions' && styles.segmentTextActive]}>
            Attendance ({sessions.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'officers' && styles.segmentBtnActive]}
          onPress={() => setActiveSegment('officers')}
        >
          <Ionicons
            name="people-outline"
            size={16}
            color={activeSegment === 'officers' ? '#059669' : '#64748b'}
          />
          <Text style={[styles.segmentText, activeSegment === 'officers' && styles.segmentTextActive]}>
            Directory ({officers.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar for Sessions & Officers */}
      {activeSegment !== 'live' ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeSegment === 'sessions' ? 'Search sessions by officer or ID...' : 'Search employee directory...'
            }
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Content Rendering based on segment */}
      {loading && !refreshing ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Syncing admin operations...</Text>
        </View>
      ) : (
        <>
          {/* ========================================================= */}
          {/* 1. LIVE OFFICERS VIEW                                     */}
          {/* ========================================================= */}
          {activeSegment === 'live' ? (
            <View style={styles.listSection}>
              {liveOfficers.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="radio-outline" size={44} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>No Officers Currently Tracking</Text>
                  <Text style={styles.emptySub}>
                    When field officers punch in on their mobile device, their live coordinates and tracking status will update here automatically.
                  </Text>
                </View>
              ) : (
                liveOfficers.map((officer, index) => (
                  <View key={`live-${officer.session_id || index}`} style={styles.officerCard}>
                    <View style={styles.officerCardHeader}>
                      <View style={styles.officerAvatar}>
                        <Text style={styles.avatarText}>
                          {officer.display_name?.substring(0, 2).toUpperCase() || 'FO'}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.officerName}>{officer.display_name}</Text>
                        <Text style={styles.officerSub}>Active Duty Session #{officer.session_id}</Text>
                      </View>
                      <View
                        style={[
                          styles.trackingBadge,
                          officer.tracking_status === 'ACTIVE'
                            ? styles.badgeGreen
                            : styles.badgeAmber,
                        ]}
                      >
                        <View
                          style={[
                            styles.dot,
                            officer.tracking_status === 'ACTIVE' ? styles.dotGreen : styles.dotAmber,
                          ]}
                        />
                        <Text
                          style={[
                            styles.trackingBadgeText,
                            officer.tracking_status === 'ACTIVE' ? styles.textGreen : styles.textAmber,
                          ]}
                        >
                          {officer.tracking_status === 'ACTIVE' ? 'Tracking Live' : 'Location Lost'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardDivider} />

                    <View style={styles.metricsRow}>
                      <View style={styles.metricItem}>
                        <Ionicons name="location-outline" size={14} color="#64748b" />
                        <Text style={styles.metricVal}>
                          {officer.latitude && officer.longitude
                            ? `${officer.latitude.toFixed(4)}, ${officer.longitude.toFixed(4)}`
                            : 'Pending fix'}
                        </Text>
                      </View>

                      {officer.accuracy ? (
                        <View style={styles.metricItem}>
                          <Ionicons name="speedometer-outline" size={14} color="#64748b" />
                          <Text style={styles.metricVal}>±{Math.round(officer.accuracy)}m</Text>
                        </View>
                      ) : null}

                      <View style={styles.metricItem}>
                        <Ionicons name="time-outline" size={14} color="#64748b" />
                        <Text style={styles.metricVal}>
                          In:{' '}
                          {new Date(officer.punch_in_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {/* ========================================================= */}
          {/* 2. ATTENDANCE SESSIONS VIEW                               */}
          {/* ========================================================= */}
          {activeSegment === 'sessions' ? (
            <View style={styles.listSection}>
              {filteredSessions.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="calendar-outline" size={44} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>No Attendance Records Found</Text>
                  <Text style={styles.emptySub}>All past employee sessions will be logged here.</Text>
                </View>
              ) : (
                filteredSessions.map(session => (
                  <View key={`sess-${session.id}`} style={styles.sessionCard}>
                    <View style={styles.sessionHeaderRow}>
                      <View>
                        <Text style={styles.sessionOfficerName}>{session.display_name}</Text>
                        <Text style={styles.sessionSub}>
                          ID: {session.employee_id} • {session.department}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          session.status === 'ACTIVE' ? styles.pillGreen : styles.pillSlate,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            session.status === 'ACTIVE' ? styles.textGreen : styles.textSlate,
                          ]}
                        >
                          {session.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.sessionTimesGrid}>
                      <View style={styles.timeBox}>
                        <Text style={styles.timeLabel}>PUNCH IN</Text>
                        <Text style={styles.timeValue}>
                          {session.punch_in_at
                            ? new Date(session.punch_in_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '--'}
                        </Text>
                      </View>

                      <View style={styles.timeBox}>
                        <Text style={styles.timeLabel}>PUNCH OUT</Text>
                        <Text style={styles.timeValue}>
                          {session.punch_out_at
                            ? new Date(session.punch_out_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Ongoing'}
                        </Text>
                      </View>

                      <View style={styles.timeBox}>
                        <Text style={styles.timeLabel}>DURATION</Text>
                        <Text style={styles.timeValue}>{formatDuration(session.duration_seconds)}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {/* ========================================================= */}
          {/* 3. OFFICER DIRECTORY VIEW                                 */}
          {/* ========================================================= */}
          {activeSegment === 'officers' ? (
            <View style={styles.listSection}>
              {filteredOfficers.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="people-outline" size={44} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>No Employees Found</Text>
                </View>
              ) : (
                filteredOfficers.map(officer => (
                  <View key={`user-${officer.id}`} style={styles.userCard}>
                    <View style={styles.userCardRow}>
                      <View style={styles.officerAvatar}>
                        <Text style={styles.avatarText}>
                          {officer.first_name ? officer.first_name.charAt(0) : officer.username.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.userName}>
                          {officer.first_name ? `${officer.first_name} ${officer.last_name}` : officer.username}
                        </Text>
                        <Text style={styles.userDesignation}>
                          {officer.profile?.designation || (officer.role === 'ADMIN' ? 'System Administrator' : 'Field Officer')}
                        </Text>
                        <Text style={styles.userDept}>
                          {officer.profile?.department || 'IT Division (GNFC)'} • {officer.profile?.employee_id || officer.username}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.roleBadge,
                          officer.role === 'ADMIN' ? styles.roleBadgeAdmin : styles.roleBadgeUser,
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleBadgeText,
                            officer.role === 'ADMIN' ? styles.roleTextAdmin : styles.roleTextUser,
                          ]}
                        >
                          {officer.role}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  adminRolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  adminRoleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    letterSpacing: 0.5,
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#b91c1c',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
  },
  statIconWrap: {
    marginBottom: 6,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  segmentTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  listSection: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  officerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
  },
  officerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  officerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#059669',
  },
  officerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  officerSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  trackingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  badgeGreen: {
    backgroundColor: '#ecfdf5',
  },
  badgeAmber: {
    backgroundColor: '#fffbeb',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotGreen: {
    backgroundColor: '#059669',
  },
  dotAmber: {
    backgroundColor: '#d97706',
  },
  trackingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textGreen: {
    color: '#059669',
  },
  textAmber: {
    color: '#d97706',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricVal: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  sessionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  sessionOfficerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  sessionSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillGreen: {
    backgroundColor: '#ecfdf5',
  },
  pillSlate: {
    backgroundColor: '#f1f5f9',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  textSlate: {
    color: '#64748b',
  },
  sessionTimesGrid: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    justifyContent: 'space-around',
  },
  timeBox: {
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  userCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
  },
  userCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  userDesignation: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
  },
  userDept: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  roleBadgeAdmin: {
    backgroundColor: '#ecfdf5',
  },
  roleBadgeUser: {
    backgroundColor: '#f1f5f9',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  roleTextAdmin: {
    color: '#059669',
  },
  roleTextUser: {
    color: '#64748b',
  },
});
