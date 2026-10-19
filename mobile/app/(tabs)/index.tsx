import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useKeepAwake } from 'expo-keep-awake';
import { useTranslation } from 'react-i18next';

import { useTracking } from '../../src/context/TrackingContext';
import api, { errorMessage } from '../../src/services/api';
import { getLocalConsent, setLocalConsent } from '../../src/services/storage';
import { AttendanceSession } from '../../src/types';

function ScreenKeepAwake({ active }: { active: boolean }) {
  if (active) {
    return <KeepAwakeComponent />;
  }
  return null;
}

function KeepAwakeComponent() {
  useKeepAwake();
  return null;
}

export default function AttendanceScreen() {
  const { t } = useTranslation();
  const {
    lastPoint,
    lastUpdateAt,
    interruptionCount,
    activeSession,
    startTrackingForSession,
    stopTrackingForSession,
    refreshActiveSession,
  } = useTracking();

  // Keep screen awake while actively punched in
  const isSessionActive = Boolean(activeSession && activeSession.status === 'ACTIVE');

  // Pre-requisites State
  const [hasConsented, setHasConsented] = useState<boolean>(false);
  const [locationPermGranted, setLocationPermGranted] = useState<boolean>(false);
  const [locationServicesOn, setLocationServicesOn] = useState<boolean>(false);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  // Loading & Submitting State
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [punchingIn, setPunchingIn] = useState<boolean>(false);
  const [punchingOut, setPunchingOut] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Live Elapsed Time State
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // 1. Initial Checks (active session, consent, permissions)


  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await refreshActiveSession();

        // Check Consent (backend + local fallback)
        try {
          const consentRes = await api.get<{ has_consented: boolean }>('/attendance/consent/?policy_version=1.0');
          if (consentRes.data?.has_consented) {
            if (isMounted) setHasConsented(true);
            await setLocalConsent(true);
          } else {
            const local = await getLocalConsent();
            if (isMounted) setHasConsented(local);
          }
        } catch {
          const local = await getLocalConsent();
          if (isMounted) setHasConsented(local);
        }

        // Check Location Permissions & Services
        try {
          const { status: locStatus } = await Location.getForegroundPermissionsAsync();
          if (isMounted) setLocationPermGranted(locStatus === 'granted');

          const services = await Location.hasServicesEnabledAsync();
          if (isMounted) setLocationServicesOn(services);
        } catch {
          if (isMounted) {
            setLocationPermGranted(false);
            setLocationServicesOn(false);
          }
        }
      } catch (e) {
        console.warn('Preflight check error:', e);
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [refreshActiveSession]);

  // 2. Live Shift Timer
  useEffect(() => {
    if (!isSessionActive || !activeSession?.punch_in_at) {
      return;
    }
    const startTime = new Date(activeSession.punch_in_at).getTime();

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setElapsedSeconds(diff);
    };

    updateTimer();
    const iv = setInterval(updateTimer, 1000);

    return () => {
      clearInterval(iv);
    };
  }, [isSessionActive, activeSession?.punch_in_at]);

  // 3. Current Time Ticker for relative time calculation
  useEffect(() => {
    const iv = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const relativeTimeText = (() => {
    if (!lastUpdateAt) return 'Waiting for fix...';
    if (!currentTime) return 'Just now';
    const diffSec = Math.max(0, Math.floor((currentTime - lastUpdateAt.getTime()) / 1000));
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    return `${Math.floor(diffSec / 60)}m ago`;
  })();

  // Request Location Permissions
  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermGranted(status === 'granted');
      const services = await Location.hasServicesEnabledAsync();
      setLocationServicesOn(services);
    } catch (e) {
      console.error('Location permission request failed:', e);
    }
  };

  // Accept Tracking Consent
  const handleToggleConsent = async () => {
    const next = !hasConsented;
    setHasConsented(next);
    await setLocalConsent(next);
    if (next) {
      try {
        await api.post('/attendance/consent/', { policy_version: '1.0' });
      } catch (e) {
        console.warn('Backend consent sync error (using local state):', e);
      }
    }
  };

  // Selfie Capture & Compression
  const handleCaptureSelfie = async () => {
    setErrorMsg('');
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is required to take your duty punch-in selfie. Please grant camera permission in system settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        // Compress to <=1280px JPEG ~0.8 using expo-image-manipulator
        const rawUri = result.assets[0].uri;
        const manipResult = await ImageManipulator.manipulateAsync(
          rawUri,
          [{ resize: { width: 1024 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        setSelfieUri(manipResult.uri);
      }
    } catch {
      setErrorMsg('Could not open camera. You can select a photo from your gallery instead.');
    }
  };

  // Gallery Fallback for Selfie
  const handlePickFromGallery = async () => {
    setErrorMsg('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        setSelfieUri(manipResult.uri);
      }
    } catch {
      setErrorMsg('Failed to select image from gallery.');
    }
  };

  // 3. PUNCH IN Execution
  const handlePunchIn = async () => {
    setErrorMsg('');
    setPunchingIn(true);

    try {
      // 1. Double check location permission & GPS
      const { status: locStatus } = await Location.getForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        throw new Error('Location permission is required to punch in.');
      }
      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        throw new Error('Device GPS services are disabled. Please turn on GPS.');
      }

      // 2. Obtain accurate current position
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      if (!selfieUri) {
        throw new Error('Please capture a duty selfie before punching in.');
      }

      // 3. Build multipart FormData
      const formData = new FormData();
      formData.append('selfie', {
        uri: selfieUri,
        name: 'selfie.jpg',
        type: 'image/jpeg',
      } as any);
      formData.append('latitude', loc.coords.latitude.toString());
      formData.append('longitude', loc.coords.longitude.toString());
      formData.append('accuracy', (loc.coords.accuracy || 10).toString());
      formData.append('consent', 'true');
      formData.append('policy_version', '1.0');

      const res = await api.post<AttendanceSession>('/attendance/punch-in/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // 4. Start active tracking
      await startTrackingForSession(res.data);
      setSelfieUri(null);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setPunchingIn(false);
    }
  };

  // 4. PUNCH OUT Execution
  const handlePunchOutConfirm = () => {
    Alert.alert(
      t('attendance.confirmPunchOutTitle'),
      t('attendance.confirmPunchOutMsg'),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Punch Out', style: 'destructive', onPress: performPunchOut },
      ]
    );
  };

  const performPunchOut = async () => {
    setErrorMsg('');
    setPunchingOut(true);

    try {
      // Try getting a final location fix
      let finalLat: number | undefined;
      let finalLng: number | undefined;
      let finalAcc: number | undefined;

      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        finalLat = loc.coords.latitude;
        finalLng = loc.coords.longitude;
        finalAcc = loc.coords.accuracy ?? undefined;
      } catch {
        // Fall back to last known point
        if (lastPoint) {
          finalLat = lastPoint.latitude;
          finalLng = lastPoint.longitude;
          finalAcc = lastPoint.accuracy ?? undefined;
        }
      }

      const payload: any = {};
      if (finalLat !== undefined && finalLng !== undefined) {
        payload.latitude = finalLat;
        payload.longitude = finalLng;
        payload.accuracy = finalAcc;
      }

      await api.post('/attendance/punch-out/', payload);
      stopTrackingForSession();
      setSelfieUri(null);
      await refreshActiveSession();
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setPunchingOut(false);
    }
  };

  // Format Elapsed Time HH:MM:SS
  const formatTimer = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loadingInitial) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Checking duty status...</Text>
      </View>
    );
  }

  // ALL CHECKLIST PREREQUISITES MET
  const allPrerequisitesMet =
    hasConsented && locationPermGranted && locationServicesOn && Boolean(selfieUri);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <ScreenKeepAwake active={isSessionActive} />
      {/* Error Banner */}
      {errorMsg ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#b91c1c" />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* ========================================================= */}
      {/* ACTIVE SESSION VIEW                                       */}
      {/* ========================================================= */}
      {isSessionActive ? (
        <View style={styles.activeContainer}>
          {/* Active Shift Card */}
          <View style={styles.activeShiftCard}>
            <View style={styles.activeCardHeader}>
              <View style={styles.badgeLive}>
                <View style={styles.livePulseDot} />
                <Text style={styles.badgeLiveText}>ACTIVE SHIFT</Text>
              </View>
              <Text style={styles.sessionDate}>
                {activeSession?.punch_in_at
                  ? new Date(activeSession.punch_in_at).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : ''}
              </Text>
            </View>

            {/* Giant Live Timer */}
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>{formatTimer(elapsedSeconds)}</Text>
              <Text style={styles.timerLabel}>{t('attendance.liveTimer')}</Text>
            </View>

            {/* Punch In Details */}
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Ionicons name="time-outline" size={16} color="#64748b" />
                <Text style={styles.detailLabel}>{t('attendance.punchInTime')}</Text>
                <Text style={styles.detailValue}>
                  {activeSession?.punch_in_at
                    ? new Date(activeSession.punch_in_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '--:--'}
                </Text>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.detailItem}>
                <Ionicons name="navigate-outline" size={16} color="#64748b" />
                <Text style={styles.detailLabel}>{t('attendance.accuracy')}</Text>
                <Text style={styles.detailValue}>
                  {lastPoint?.accuracy ? `±${Math.round(lastPoint.accuracy)}m` : 'GPS Ready'}
                </Text>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.detailItem}>
                <Ionicons name="refresh-outline" size={16} color="#64748b" />
                <Text style={styles.detailLabel}>{t('attendance.lastUpdate')}</Text>
                <Text style={styles.detailValue}>{relativeTimeText}</Text>
              </View>
            </View>

            {/* Interruptions Counter */}
            {interruptionCount > 0 ? (
              <View style={styles.interruptionWarning}>
                <Ionicons name="warning-outline" size={16} color="#b45309" />
                <Text style={styles.interruptionText}>
                  {interruptionCount} {interruptionCount === 1 ? 'interruption' : 'interruptions'}{' '}
                  recorded during shift
                </Text>
              </View>
            ) : null}
          </View>

          {/* Privacy & Transparency Banner */}
          <View style={styles.trackingNoticeBanner}>
            <Ionicons name="eye-outline" size={20} color="#047857" style={{ marginRight: 8 }} />
            <Text style={styles.trackingNoticeText}>{t('attendance.trackingBanner')}</Text>
          </View>

          {/* PUNCH OUT BUTTON */}
          <TouchableOpacity
            style={[styles.punchOutButton, punchingOut && styles.buttonDisabled]}
            onPress={handlePunchOutConfirm}
            disabled={punchingOut}
            activeOpacity={0.85}
          >
            {punchingOut ? (
              <View style={styles.rowCenter}>
                <ActivityIndicator color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.punchOutButtonText}>{t('attendance.punchingOut')}</Text>
              </View>
            ) : (
              <View style={styles.rowCenter}>
                <Ionicons name="stop-circle-outline" size={24} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.punchOutButtonText}>{t('attendance.punchOut')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* ========================================================= */
        /* IDLE VIEW (PUNCH IN WORKFLOW)                             */
        /* ========================================================= */
        <View style={styles.idleContainer}>
          {/* 1. Consent Policy Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIconBadge}>
                <Ionicons name="shield-outline" size={20} color="#059669" />
              </View>
              <Text style={styles.cardTitle}>{t('attendance.consentTitle')}</Text>
            </View>
            <Text style={styles.cardBodyText}>{t('attendance.consentBody')}</Text>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={handleToggleConsent}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, hasConsented && styles.checkboxActive]}>
                {hasConsented ? <Ionicons name="checkmark" size={16} color="#ffffff" /> : null}
              </View>
              <Text style={styles.checkboxLabel}>{t('attendance.consentCheckbox')}</Text>
            </TouchableOpacity>
          </View>

          {/* 2. Permissions & GPS Status Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIconBadge}>
                <Ionicons name="location-outline" size={20} color="#059669" />
              </View>
              <Text style={styles.cardTitle}>Location & GPS Health</Text>
            </View>

            {/* Foreground Permission */}
            <View style={styles.statusRow}>
              <View style={styles.statusLabelRow}>
                <Ionicons
                  name={locationPermGranted ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={locationPermGranted ? '#059669' : '#dc2626'}
                />
                <Text style={styles.statusTitle}>{t('attendance.locationPermission')}</Text>
              </View>
              <Text style={locationPermGranted ? styles.tagSuccess : styles.tagError}>
                {locationPermGranted ? t('attendance.granted') : t('attendance.denied')}
              </Text>
            </View>

            {/* GPS Hardware Services */}
            <View style={styles.statusRow}>
              <View style={styles.statusLabelRow}>
                <Ionicons
                  name={locationServicesOn ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={locationServicesOn ? '#059669' : '#dc2626'}
                />
                <Text style={styles.statusTitle}>{t('attendance.gpsServices')}</Text>
              </View>
              <Text style={locationServicesOn ? styles.tagSuccess : styles.tagError}>
                {locationServicesOn ? 'Enabled' : 'Disabled'}
              </Text>
            </View>

            {(!locationPermGranted || !locationServicesOn) && (
              <TouchableOpacity
                style={styles.openSettingsButton}
                onPress={() => {
                  if (!locationPermGranted) {
                    requestLocationPermission();
                  } else {
                    Linking.openSettings();
                  }
                }}
              >
                <Ionicons name="settings-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={styles.openSettingsText}>
                  {!locationPermGranted ? 'Grant Permission' : t('attendance.openSettings')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 3. Duty Selfie Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardIconBadge}>
                <Ionicons name="camera-outline" size={20} color="#059669" />
              </View>
              <Text style={styles.cardTitle}>{t('attendance.cameraPermission')}</Text>
            </View>

            {selfieUri ? (
              <View style={styles.selfiePreviewContainer}>
                <Image source={{ uri: selfieUri }} style={styles.selfieImage as any} />
                <TouchableOpacity
                  style={styles.retakeButton}
                  onPress={handleCaptureSelfie}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.retakeButtonText}>{t('attendance.retake')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.cameraActionRow}>
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={handleCaptureSelfie}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={22} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.captureButtonText}>{t('attendance.takeSelfie')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.galleryFallbackButton}
                  onPress={handlePickFromGallery}
                  activeOpacity={0.8}
                >
                  <Ionicons name="images-outline" size={18} color="#475569" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 4. Readiness Checklist Summary */}
          <View style={styles.checklistCard}>
            <Text style={styles.checklistTitle}>Readiness Checklist:</Text>
            <View style={styles.checkItem}>
              <Ionicons
                name={hasConsented ? 'checkbox' : 'square-outline'}
                size={18}
                color={hasConsented ? '#059669' : '#94a3b8'}
              />
              <Text style={[styles.checkText, hasConsented && styles.checkTextDone]}>
                Tracking consent agreed
              </Text>
            </View>
            <View style={styles.checkItem}>
              <Ionicons
                name={locationPermGranted && locationServicesOn ? 'checkbox' : 'square-outline'}
                size={18}
                color={locationPermGranted && locationServicesOn ? '#059669' : '#94a3b8'}
              />
              <Text
                style={[
                  styles.checkText,
                  locationPermGranted && locationServicesOn && styles.checkTextDone,
                ]}
              >
                Location & GPS active
              </Text>
            </View>
            <View style={styles.checkItem}>
              <Ionicons
                name={selfieUri ? 'checkbox' : 'square-outline'}
                size={18}
                color={selfieUri ? '#059669' : '#94a3b8'}
              />
              <Text style={[styles.checkText, selfieUri && styles.checkTextDone]}>
                Duty selfie captured
              </Text>
            </View>
          </View>

          {/* PUNCH IN BUTTON */}
          <TouchableOpacity
            style={[
              styles.punchInButton,
              (!allPrerequisitesMet || punchingIn) && styles.buttonDisabled,
            ]}
            onPress={handlePunchIn}
            disabled={!allPrerequisitesMet || punchingIn}
            activeOpacity={0.85}
          >
            {punchingIn ? (
              <View style={styles.rowCenter}>
                <ActivityIndicator color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.punchInButtonText}>{t('attendance.punchingIn')}</Text>
              </View>
            ) : (
              <View style={styles.rowCenter}>
                <Ionicons name="finger-print" size={24} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.punchInButtonText}>{t('attendance.punchIn')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
  // Cards
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardBodyText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 12,
  },
  // Checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  // Status Rows
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  statusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginLeft: 8,
  },
  tagSuccess: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagError: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  openSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
  },
  openSettingsText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  // Camera & Selfie
  cameraActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  captureButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    height: 48,
    borderRadius: 14,
  },
  captureButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  galleryFallbackButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfiePreviewContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  selfieImage: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    borderColor: '#059669',
    marginBottom: 12,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#475569',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retakeButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  // Checklist
  checklistCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  checklistTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  checkText: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 8,
  },
  checkTextDone: {
    color: '#0f172a',
    fontWeight: '600',
  },
  // Punch In Button
  punchInButton: {
    backgroundColor: '#059669',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  punchInButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  // ====================
  // Active Shift Styles
  // ====================
  activeContainer: {
    flex: 1,
  },
  activeShiftCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 5,
    marginBottom: 16,
  },
  activeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  badgeLiveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
  },
  sessionDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  timerContainer: {
    alignItems: 'center',
    marginVertical: 18,
  },
  timerText: {
    fontSize: 44,
    fontWeight: '900',
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 16,
    marginTop: 8,
  },
  detailItem: {
    alignItems: 'center',
    flex: 1,
  },
  detailDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#e2e8f0',
  },
  detailLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  interruptionWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  interruptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    marginLeft: 8,
  },
  trackingNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    marginBottom: 20,
  },
  trackingNoticeText: {
    fontSize: 12,
    color: '#065f46',
    fontWeight: '600',
    lineHeight: 18,
    flex: 1,
  },
  punchOutButton: {
    backgroundColor: '#dc2626',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  punchOutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  idleContainer: {
    flex: 1,
  },
});
