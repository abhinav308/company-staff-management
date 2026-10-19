import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import StatusChip from '../../src/components/StatusChip';
import { useTracking } from '../../src/context/TrackingContext';

export default function TabLayout() {
  const { t } = useTranslation();
  const { status } = useTracking();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: styles.header,
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerRight: () => (
          <View style={styles.headerRightContainer}>
            <StatusChip status={status} />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.attendance'),
          headerTitle: () => (
            <View>
              <Text style={styles.headerBrand}>Ncode Operations</Text>
              <Text style={styles.headerSub}>{t('tabs.attendance')}</Text>
            </View>
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="finger-print-outline" size={size} color={typeof color === 'string' ? color : '#059669'} />
          ),
        }}
      />
      <Tabs.Screen
        name="visits"
        options={{
          title: t('tabs.visits'),
          headerTitle: () => (
            <View>
              <Text style={styles.headerBrand}>Ncode Operations</Text>
              <Text style={styles.headerSub}>{t('tabs.visits')}</Text>
            </View>
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={typeof color === 'string' ? color : '#64748b'} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('tabs.history'),
          headerTitle: () => (
            <View>
              <Text style={styles.headerBrand}>Ncode Operations</Text>
              <Text style={styles.headerSub}>{t('tabs.history')}</Text>
            </View>
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={typeof color === 'string' ? color : '#64748b'} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          headerTitle: () => (
            <View>
              <Text style={styles.headerBrand}>Ncode Operations</Text>
              <Text style={styles.headerSub}>{t('tabs.profile')}</Text>
            </View>
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={typeof color === 'string' ? color : '#64748b'} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          headerTitle: () => (
            <View>
              <Text style={styles.headerBrand}>Ncode Operations</Text>
              <Text style={styles.headerSub}>Admin Portal</Text>
            </View>
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark-outline" size={size} color={typeof color === 'string' ? color : '#059669'} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    height: 70,
  },
  headerBrand: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  headerRightContainer: {
    marginRight: 16,
  },
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    height: 60,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
