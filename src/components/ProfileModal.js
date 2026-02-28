import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, Modal, TouchableOpacity, 
    TextInput, KeyboardAvoidingView, Platform, ScrollView,
    ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

const ProfileModal = ({ visible, onClose, onSecurityUpdate }) => {
    const insets = useSafeAreaInsets();
    const { profile, updateProfile, logout } = useAuth();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible && profile) {
            setFullName(profile.full_name || '');
            setEmail(profile.email || '');
            setPin(profile.recovery_pin || '');
            setPassword(''); // Reset password field
        }
    }, [visible, profile]);

    const handleUpdate = async () => {
        if (!fullName.trim() || !email.trim() || !pin.trim()) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        if (pin.length !== 4 || isNaN(pin)) {
            Alert.alert('Error', 'PIN must be exactly 4 digits');
            return;
        }

        // Check if sensitive info changed
        const emailChanged = email.trim() !== profile.email;
        const pinChanged = pin.trim() !== profile.recovery_pin;
        const passwordChanged = password.trim() !== '';
        const needsRelogin = emailChanged || pinChanged || passwordChanged;

        setLoading(true);
        const { error } = await updateProfile({
            full_name: fullName.trim(),
            email: email.trim(),
            recovery_pin: pin.trim(),
            password: password.trim() || undefined
        });
        setLoading(false);

        if (error) {
            Alert.alert('Update Failed', error.message);
        } else {
            if (needsRelogin) {
                // First close all modals (Profile and Side Menu) so the screen is clear
                if (onSecurityUpdate) onSecurityUpdate(); 
                else onClose();
                
                // Then show the alert. When user clicks OK, perform the logout
                Alert.alert(
                    'Security Update', 
                    'You have updated your security credentials (Email, Password, or PIN). For security, you will be logged out. Please log in with your new details.',
                    [{ text: 'OK', onPress: () => logout() }]
                );
            } else {
                onClose(); // Just close the Profile Modal for simple name changes
                Alert.alert('Success', 'Profile updated successfully!');
            }
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Ionicons name="close" size={26} color="#aaa" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>View Profile</Text>
                    <View style={{ width: 40 }} />
                </View>

                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <View style={styles.avatarSection}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarChar}>
                                    {(fullName || '?').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                            <Text style={styles.avatarSubtext}>Edit Personal Information</Text>
                        </View>

                        <View style={styles.form}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Full Name</Text>
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        value={fullName}
                                        onChangeText={setFullName}
                                        placeholder="Your full name"
                                        placeholderTextColor="#555"
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Email Address</Text>
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        value={email}
                                        onChangeText={setEmail}
                                        placeholder="Your email address"
                                        placeholderTextColor="#555"
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Recovery PIN (4 Digits)</Text>
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        value={pin}
                                        onChangeText={(v) => setPin(v.replace(/[^0-9]/g, '').slice(0, 4))}
                                        placeholder="4 digit PIN"
                                        placeholderTextColor="#555"
                                        keyboardType="numeric"
                                        maxLength={4}
                                        secureTextEntry={!showPin}
                                    />
                                    <TouchableOpacity 
                                        onPress={() => setShowPin(!showPin)}
                                        style={styles.eyeIcon}
                                    >
                                        <Ionicons 
                                            name={showPin ? "eye-off-outline" : "eye-outline"} 
                                            size={20} 
                                            color="#666" 
                                        />
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.hint}>Used for password recovery and unlocking secure areas.</Text>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Update Password (Optional)</Text>
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="key-outline" size={20} color="#666" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        value={password}
                                        onChangeText={setPassword}
                                        placeholder="Enter new password"
                                        placeholderTextColor="#555"
                                        secureTextEntry={!showPassword}
                                    />
                                    <TouchableOpacity 
                                        onPress={() => setShowPassword(!showPassword)}
                                        style={styles.eyeIcon}
                                    >
                                        <Ionicons 
                                            name={showPassword ? "eye-off-outline" : "eye-outline"} 
                                            size={20} 
                                            color="#666" 
                                        />
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.hint}>Leave blank to keep your current password.</Text>
                            </View>

                            <TouchableOpacity 
                                style={[styles.updateBtn, loading && styles.updateBtnDisabled]}
                                onPress={handleUpdate}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator size="small" color="#000" />
                                ) : (
                                    <Text style={styles.updateBtnText}>Save Changes</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0A',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        height: 60,
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F1F',
    },
    closeBtn: {
        padding: 5,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    scrollContent: {
        padding: 20,
    },
    avatarSection: {
        alignItems: 'center',
        marginBottom: 20,
        marginTop: 10,
    },
    avatar: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 3,
        borderColor: '#121212',
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },
    avatarChar: {
        color: '#000',
        fontSize: 28,
        fontWeight: 'bold',
    },
    avatarSubtext: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    form: {
        backgroundColor: '#121212',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#1F1F1F',
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        color: '#aaa',
        fontSize: 13,
        marginBottom: 8,
        marginLeft: 4,
        fontWeight: '600',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A1A',
        borderRadius: 12,
        paddingHorizontal: 15,
        height: 55,
        borderWidth: 1,
        borderColor: '#2A2A2A',
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
    },
    eyeIcon: {
        padding: 5,
    },
    hint: {
        color: '#555',
        fontSize: 11,
        marginTop: 6,
        marginLeft: 4,
        fontStyle: 'italic',
    },
    updateBtn: {
        backgroundColor: '#1DB954',
        height: 55,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    updateBtnDisabled: {
        opacity: 0.7,
        backgroundColor: '#147a38',
    },
    updateBtnText: {
        color: '#000',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default ProfileModal;
