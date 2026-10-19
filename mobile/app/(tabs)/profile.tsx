import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/context/AuthContext';
import api, { errorMessage } from '../../src/services/api';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();

  // Modals state
  const [comingSoonModal, setComingSoonModal] = useState<string | null>(null);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);

  // Change Password Form State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Logout Handler
  const handleLogoutConfirm = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  // Language Change Handler
  const handleSelectLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setLanguageModalVisible(false);
  };

  // Change Password Submit
  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setPasswordLoading(true);
    setPasswordError('');
    setPasswordSuccess('');

    try {
      await api.post('/me/change-password/', {
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setPasswordSuccess('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setPasswordModalVisible(false);
        setPasswordSuccess('');
      }, 1500);
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setPasswordLoading(false);
    }
  };

  const getInitials = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    return user?.username?.substring(0, 2).toUpperCase() || 'FO';
  };

  const currentLanguageLabel = () => {
    if (i18n.language === 'hi') return 'हिंदी (Hindi)';
    if (i18n.language === 'gj') return 'ગુજરાતી (Gujarati)';
    return 'English';
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 1. Profile Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{getInitials()}</Text>
        </View>

        <View style={styles.profileInfo}>
          <Text style={styles.userName}>
            {user?.first_name} {user?.last_name || user?.username}
          </Text>
          <Text style={styles.userRole}>
            {user?.profile?.designation || 'Field Operations Officer'}
          </Text>
          <Text style={styles.userMeta}>
            ID: {user?.profile?.employee_id || user?.username} •{' '}
            {user?.profile?.department || 'IT Division'}
          </Text>
          <Text style={styles.userLocation}>
            {user?.profile?.office || 'Headquarters - West Zone'}
          </Text>
        </View>
      </View>

      {/* 2. MY WORK Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('profile.myWork')}</Text>
      </View>
      <View style={styles.tileCard}>
        <TouchableOpacity
          style={styles.tileRow}
          onPress={() => setComingSoonModal(t('profile.viewAttendance'))}
          activeOpacity={0.7}
        >
          <View style={[styles.tileIcon, { backgroundColor: '#eff6ff' }]}>
            <Ionicons name="calendar" size={20} color="#2563eb" />
          </View>
          <Text style={styles.tileLabel}>{t('profile.viewAttendance')}</Text>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>

        <View style={styles.tileDivider} />

        <TouchableOpacity
          style={styles.tileRow}
          onPress={() => setComingSoonModal(t('profile.holidayList'))}
          activeOpacity={0.7}
        >
          <View style={[styles.tileIcon, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="sunny" size={20} color="#d97706" />
          </View>
          <Text style={styles.tileLabel}>{t('profile.holidayList')}</Text>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>

        <View style={styles.tileDivider} />

        <TouchableOpacity
          style={styles.tileRow}
          onPress={() => setComingSoonModal(t('profile.notes'))}
          activeOpacity={0.7}
        >
          <View style={[styles.tileIcon, { backgroundColor: '#f5f3ff' }]}>
            <Ionicons name="document-text" size={20} color="#7c3aed" />
          </View>
          <Text style={styles.tileLabel}>{t('profile.notes')}</Text>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* 3. UPDATES & HR Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('profile.myHr')}</Text>
      </View>
      <View style={styles.tileCard}>
        <TouchableOpacity
          style={styles.tileRow}
          onPress={() => setComingSoonModal(t('profile.announcements'))}
          activeOpacity={0.7}
        >
          <View style={[styles.tileIcon, { backgroundColor: '#ecfdf5' }]}>
            <Ionicons name="notifications" size={20} color="#059669" />
          </View>
          <Text style={styles.tileLabel}>{t('profile.announcements')}</Text>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* 4. ACCOUNT Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('profile.account')}</Text>
      </View>
      <View style={styles.tileCard}>
        <TouchableOpacity
          style={styles.tileRow}
          onPress={() => setPasswordModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.tileIcon, { backgroundColor: '#f1f5f9' }]}>
            <Ionicons name="key-outline" size={20} color="#475569" />
          </View>
          <Text style={styles.tileLabel}>{t('profile.changePassword')}</Text>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>

        <View style={styles.tileDivider} />

        <TouchableOpacity
          style={styles.tileRow}
          onPress={() => setLanguageModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.tileIcon, { backgroundColor: '#f1f5f9' }]}>
            <Ionicons name="globe-outline" size={20} color="#475569" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileLabel}>{t('profile.language')}</Text>
            <Text style={styles.tileSub}>{currentLanguageLabel()}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>

        <View style={styles.tileDivider} />

        <TouchableOpacity
          style={styles.tileRow}
          onPress={handleLogoutConfirm}
          activeOpacity={0.7}
        >
          <View style={[styles.tileIcon, { backgroundColor: '#fef2f2' }]}>
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          </View>
          <Text style={[styles.tileLabel, { color: '#dc2626' }]}>{t('profile.logout')}</Text>
          <Ionicons name="chevron-forward" size={18} color="#dc2626" />
        </TouchableOpacity>
      </View>

      {/* ==================================================== */}
      {/* COMING SOON MODAL                                    */}
      {/* ==================================================== */}
      <Modal visible={!!comingSoonModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.comingSoonBadge}>
              <Ionicons name="sparkles" size={32} color="#059669" />
            </View>
            <Text style={styles.modalTitle}>{comingSoonModal}</Text>
            <Text style={styles.modalText}>{t('profile.comingSoon')}</Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setComingSoonModal(null)}
            >
              <Text style={styles.modalCloseBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* LANGUAGE SELECTOR MODAL                              */}
      {/* ==================================================== */}
      <Modal visible={languageModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose Language / ભાષા પસંદ કરો</Text>
            <TouchableOpacity
              style={styles.langOption}
              onPress={() => handleSelectLanguage('en')}
            >
              <Text style={styles.langOptionText}>English</Text>
              {i18n.language === 'en' && <Ionicons name="checkmark" size={20} color="#059669" />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.langOption}
              onPress={() => handleSelectLanguage('hi')}
            >
              <Text style={styles.langOptionText}>हिंदी (Hindi)</Text>
              {i18n.language === 'hi' && <Ionicons name="checkmark" size={20} color="#059669" />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.langOption}
              onPress={() => handleSelectLanguage('gj')}
            >
              <Text style={styles.langOptionText}>ગુજરાતી (Gujarati)</Text>
              {i18n.language === 'gj' && <Ionicons name="checkmark" size={20} color="#059669" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setLanguageModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* CHANGE PASSWORD MODAL                                */}
      {/* ==================================================== */}
      <Modal visible={passwordModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>

            {passwordError ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color="#b91c1c" />
                <Text style={styles.errorText}>{passwordError}</Text>
              </View>
            ) : null}

            {passwordSuccess ? (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={16} color="#059669" />
                <Text style={styles.successText}>{passwordSuccess}</Text>
              </View>
            ) : null}

            <TextInput
              style={styles.input}
              placeholder="Current Password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={oldPassword}
              onChangeText={setOldPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="New Password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm New Password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setPasswordModalVisible(false)}
                disabled={passwordLoading}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleChangePassword}
                disabled={passwordLoading}
              >
                {passwordLoading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ecfdf5',
    borderWidth: 2,
    borderColor: '#a7f3d0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#059669',
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  userRole: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
    marginTop: 2,
  },
  userMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 3,
  },
  userLocation: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  sectionHeader: {
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
  },
  tileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  tileLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  tileSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  tileDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginLeft: 66,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  comingSoonBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  modalCloseBtn: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  langOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  langOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  modalCancelBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCancelBtnText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 10,
    backgroundColor: '#f8fafc',
  },
  modalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    marginTop: 8,
    gap: 10,
  },
  modalSaveBtn: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  modalSaveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    width: '100%',
  },
  errorText: {
    color: '#991b1b',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    width: '100%',
  },
  successText: {
    color: '#059669',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
});
