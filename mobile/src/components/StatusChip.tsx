import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppTrackingStatus } from '../types';

interface StatusChipProps {
  status: AppTrackingStatus;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status }) => {
  const { t } = useTranslation();
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (status === 'ON_DUTY') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  switch (status) {
    case 'ON_DUTY':
      return (
        <View style={[styles.container, styles.onDutyBg]}>
          <Animated.View style={[styles.dot, styles.onDutyDot, { opacity: pulseAnim }]} />
          <Text style={[styles.text, styles.onDutyText]}>{t('status.onDuty')}</Text>
        </View>
      );

    case 'LOCATION_LOST':
      return (
        <View style={[styles.container, styles.locationLostBg]}>
          <Ionicons name="alert-circle" size={13} color="#b45309" style={styles.icon} />
          <Text style={[styles.text, styles.locationLostText]}>{t('status.locationLost')}</Text>
        </View>
      );

    case 'OFFLINE':
      return (
        <View style={[styles.container, styles.offlineBg]}>
          <Ionicons name="cloud-offline" size={13} color="#be123c" style={styles.icon} />
          <Text style={[styles.text, styles.offlineText]}>{t('status.offline')}</Text>
        </View>
      );

    case 'OFF_DUTY':
    default:
      return (
        <View style={[styles.container, styles.offDutyBg]}>
          <View style={[styles.dot, styles.offDutyDot]} />
          <Text style={[styles.text, styles.offDutyText]}>{t('status.offDuty')}</Text>
        </View>
      );
  }
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // On Duty
  onDutyBg: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  onDutyDot: {
    backgroundColor: '#10b981',
  },
  onDutyText: {
    color: '#047857',
  },
  // Location Lost
  locationLostBg: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  locationLostText: {
    color: '#b45309',
  },
  // Offline
  offlineBg: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  offlineText: {
    color: '#be123c',
  },
  // Off Duty
  offDutyBg: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  offDutyDot: {
    backgroundColor: '#94a3b8',
  },
  offDutyText: {
    color: '#475569',
  },
});

export default StatusChip;
