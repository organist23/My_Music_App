import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useMenu } from '../../context/MenuContext';
import { supabase } from '../../supabaseClient';
import { downloadMusicFile, saveToSAF } from '../../services/DownloadService';
import * as FileSystem from 'expo-file-system/legacy';
const { StorageAccessFramework } = FileSystem;
import { Platform } from 'react-native';

const SettingsMaintenanceScreen = ({ navigation }) => {
    const { profile } = useAuth();
    const { 
        storageUsage, 
        isRefreshing, 
        refreshStorageUsage, 
        formatSystem,
        formatProgress 
    } = useMenu();
    const [backupProgress, setBackupProgress] = useState(null); // { current, total, name }

    useEffect(() => {
        refreshStorageUsage();
    }, []);

    const handleBackupAll = async () => {
        try {
            const { data, error } = await supabase.from('music').select('*');
            if (error) throw error;
            if (!data || data.length === 0) {
                Alert.alert('Empty', 'No music to backup!');
                return;
            }

            Alert.alert(
                'Bulk Backup',
                `Start downloading all ${data.length} tracks to your device? ${Platform.OS === 'android' ? 'You will be asked to pick a destination folder.' : ''}`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                        text: 'Start Backup', 
                        onPress: async () => {
                            let directoryUri = null;
                            
                            // 1. Android: Request folder permission
                            if (Platform.OS === 'android') {
                                try {
                                    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
                                    if (!permissions.granted) {
                                        Alert.alert('Permission Denied', 'Folder access is required for backup.');
                                        return;
                                    }
                                    directoryUri = permissions.directoryUri;
                                } catch (err) {
                                    Alert.alert('Error', 'Failed to access folder picker.');
                                    return;
                                }
                            }

                            let count = 0;
                            setBackupProgress({ current: 0, total: data.length, name: 'Starting...' });
                            
                            for (const track of data) {
                                count++;
                                setBackupProgress({ current: count, total: data.length, name: track.title });
                                
                                const downloadRes = await downloadMusicFile(track.audio_url, track.title, null, true);
                                
                                if (downloadRes.success && directoryUri) {
                                    // Move to SAF folder on Android
                                    await saveToSAF(downloadRes.uri, track.title, directoryUri);
                                }
                            }
                            
                            setBackupProgress(null);
                            Alert.alert('Success', 'All tracks backed up to local storage!');
                        }
                    }
                ]
            );
        } catch (error) {
            Alert.alert('Error', 'Failed to start backup');
        }
    };

    const handleFormat = () => {
        Alert.alert(
            "Format System",
            "This will PERMANENTLY delete all music, playlists, and files in this specific project. This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "YES, FORMAT SYSTEM", 
                    style: "destructive",
                    onPress: () => {
                        Alert.alert(
                            "Final Confirmation",
                            "Are you absolutely sure? Type nothing, just confirm to wipe the system.",
                            [
                                { text: "Cancel", style: "cancel" },
                                { 
                                    text: "WIPE EVERYTHING", 
                                    style: "destructive",
                                    onPress: async () => {
                                        const success = await formatSystem();
                                        if (success) {
                                            navigation.navigate('AdminDashboard');
                                        }
                                    }
                                }
                            ]
                        );
                    }
                }
            ]
        );
    };

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const storageLimit = 1024 * 1024 * 1024; // 1GB
    const storagePercent = Math.min((storageUsage / storageLimit) * 100, 100);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {formatProgress && (
                <View style={[styles.backupProgressCard, styles.formatProgressCard]}>
                    <Text style={styles.backupProgressTitle}>Formatting: {formatProgress.name}</Text>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, styles.formatProgressBarFill, { width: `${(formatProgress.current / formatProgress.total) * 100}%` }]} />
                    </View>
                    <Text style={styles.backupProgressText}>{formatProgress.current} of {formatProgress.total} steps</Text>
                </View>
            )}

            {backupProgress && (
                <View style={styles.backupProgressCard}>
                    <Text style={styles.backupProgressTitle}>Backing up: {backupProgress.name}</Text>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${(backupProgress.current / backupProgress.total) * 100}%` }]} />
                    </View>
                    <Text style={styles.backupProgressText}>{backupProgress.current} of {backupProgress.total} tracks</Text>
                </View>
            )}


            <Text style={styles.sectionTitle}>System Maintenance</Text>
            
            <TouchableOpacity style={styles.actionButton} onPress={handleBackupAll}>
                <View style={styles.actionIconBg}>
                    <Ionicons name="cloud-download-outline" size={24} color="#fff" />
                </View>
                <View style={styles.actionTextContainer}>
                    <Text style={styles.actionTitle}>Backup All Music</Text>
                    <Text style={styles.actionSubtitle}>Download all tracks to local storage</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#444" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionButton, styles.dangerButton]} onPress={handleFormat}>
                <View style={[styles.actionIconBg, { backgroundColor: 'rgba(255, 68, 68, 0.1)' }]}>
                    <Ionicons name="trash-outline" size={24} color="#ff4444" />
                </View>
                <View style={styles.actionTextContainer}>
                    <Text style={[styles.actionTitle, { color: '#ff4444' }]}>Format System</Text>
                    <Text style={styles.actionSubtitle}>Permanently wipe all music and data</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#444" />
            </TouchableOpacity>

            <View style={styles.footer}>
                <Text style={styles.footerText}>Supabase Free Tier (Lifetime Storage Management)</Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    content: {
        padding: 20,
        paddingTop: 24,
        paddingBottom: 40,
    },
    sectionTitle: {
        color: '#666',
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginBottom: 15,
        marginTop: 10,
    },
    card: {
        backgroundColor: '#1E1E1E',
        borderRadius: 15,
        padding: 20,
        marginBottom: 25,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    infoLabel: {
        color: '#aaa',
        fontSize: 14,
    },
    infoValue: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    storageCard: {
        backgroundColor: '#1E1E1E',
        borderRadius: 15,
        padding: 20,
        marginBottom: 25,
    },
    storageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    cardTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    progressContainer: {
        width: '100%',
    },
    progressBarBg: {
        height: 10,
        backgroundColor: '#333',
        borderRadius: 5,
        overflow: 'hidden',
        marginBottom: 10,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#1DB954',
    },
    storageLabel: {
        color: '#aaa',
        fontSize: 12,
        textAlign: 'right',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E1E',
        borderRadius: 15,
        padding: 15,
        marginBottom: 15,
    },
    actionIconBg: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: 'rgba(29, 185, 84, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    actionTextContainer: {
        flex: 1,
    },
    actionTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    actionSubtitle: {
        color: '#666',
        fontSize: 12,
        marginTop: 2,
    },
    dangerButton: {
        marginTop: 10,
    },
    footer: {
        marginTop: 30,
        alignItems: 'center',
    },
    footerText: {
        color: '#444',
        fontSize: 10,
        marginBottom: 5,
    },
    backupProgressCard: {
        backgroundColor: 'rgba(29, 185, 84, 0.1)',
        borderWidth: 1,
        borderColor: '#1DB954',
        borderRadius: 15,
        padding: 15,
        marginBottom: 20,
    },
    backupProgressTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    backupProgressText: {
        color: '#aaa',
        fontSize: 12,
        textAlign: 'right',
    },
    formatProgressCard: {
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
        borderColor: '#ff4444',
    },
    formatProgressBarFill: {
        backgroundColor: '#ff4444',
    }
});

export default SettingsMaintenanceScreen;
