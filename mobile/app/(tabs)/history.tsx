import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import api, { errorMessage } from '../../src/services/api';

interface SessionHistoryItem {
  id: number;
  punch_in_at: string;
  punch_out_at?: string | null;
  status: 'ACTIVE' | 'CLOSED';
  tracking_status: 'ACTIVE' | 'PAUSED' | 'OFFLINE';
  last_location_at?: string | null;
  point_count?: number;
  duration_minutes?: number;
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fetchHistory = async () => {
    try {
      setErrorMsg('');
      const res = await api.get<any>('/attendance/history/');
      // Handle both raw list and paginated DRF format
      const items = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.results)
        ? res.data.results
        : [];
      setSessions(items);
    } catch (err) {
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
        const res = await api.get<any>('/attendance/history/');
        if (!isMounted) return;
        const items = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.results)
          ? res.data.results
          : [];
        setSessions(items);
      } catch (err) {
        if (isMounted) setErrorMsg(errorMessage(err));
      } finally {
        if (isMounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHistory();
  };

  const calculateDuration = (item: SessionHistoryItem): string => {
    if (item.duration_minutes) {
      const h = Math.floor(item.duration_minutes / 60);
      const m = item.duration_minutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    if (!item.punch_in_at) return '--';
    if (!item.punch_out_at) return item.status === 'ACTIVE' ? 'In progress' : '--';
    const start = new Date(item.punch_in_at).getTime();
    const end = new Date(item.punch_out_at).getTime();
    const diffMin = Math.max(0, Math.floor((end - start) / 60000));
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const renderItem = ({ item }: { item: SessionHistoryItem }) => {
    const isOngoing = item.status === 'ACTIVE';
    const dateObj = new Date(item.punch_in_at);

    return (
      <View style={styles.sessionCard}>
        <View style={styles.cardHeader}>
          <View style={styles.dateBlock}>
            <Text style={styles.dateDay}>
              {dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <Text style={styles.dateYear}>{dateObj.getFullYear()}</Text>
          </View>

          <View style={[styles.statusBadge, isOngoing ? styles.badgeActive : styles.badgeClosed]}>
            {isOngoing ? <View style={styles.activeDot} /> : null}
            <Text style={[styles.statusBadgeText, isOngoing ? styles.textActive : styles.textClosed]}>
              {isOngoing ? 'IN PROGRESS' : 'COMPLETED'}
            </Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>PUNCH IN</Text>
            <View style={styles.timeValueRow}>
              <Ionicons name="log-in-outline" size={16} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.timeValue}>
                {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>

          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>PUNCH OUT</Text>
            <View style={styles.timeValueRow}>
              <Ionicons name="log-out-outline" size={16} color="#dc2626" style={{ marginRight: 4 }} />
              <Text style={styles.timeValue}>
                {item.punch_out_at
                  ? new Date(item.punch_out_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '--:--'}
              </Text>
            </View>
          </View>

          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>DURATION</Text>
            <View style={styles.timeValueRow}>
              <Ionicons name="timer-outline" size={16} color="#2563eb" style={{ marginRight: 4 }} />
              <Text style={styles.timeValue}>{calculateDuration(item)}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {errorMsg ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#b91c1c" />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Loading attendance history...</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#059669']}
              tintColor="#059669"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={56} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No Sessions Recorded</Text>
              <Text style={styles.emptySubtitle}>{t('history.empty')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748b',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    margin: 16,
    marginBottom: 0,
    padding: 12,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  sessionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateBlock: {},
  dateDay: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  dateYear: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  badgeClosed: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  textActive: {
    color: '#047857',
  },
  textClosed: {
    color: '#64748b',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 12,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeBlock: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  timeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  timeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
});
