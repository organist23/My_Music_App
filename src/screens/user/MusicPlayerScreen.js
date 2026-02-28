import React, { useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, Modal, FlatList, Alert, Platform, Animated } from 'react-native';
import { usePlayer } from '../../context/PlayerContext';
import { useFavorites } from '../../context/FavoritesContext';
import { usePlaylists } from '../../context/PlaylistContext';
import { Ionicons } from '@expo/vector-icons';
import * as NavigationBar from 'expo-navigation-bar';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';

import { downloadMusicFile, cancelActiveDownload } from '../../services/DownloadService';

const { width, height } = Dimensions.get('window');

const MusicPlayerScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { user, role } = useAuth();
    const { 
        currentTrack, 
        isPlaying, 
        togglePlayPause, 
        position, 
        duration, 
        repeatMode,
        toggleRepeat,
        isShuffle,
        toggleShuffle,
        playNext,
        playPrev,
        seek,
        isLoading,
        isBuffering,
        sleepSeconds,
        setSleepSeconds
    } = usePlayer();
    
    const { toggleFavorite, isFavorite } = useFavorites();
    const { playlists, addSongToPlaylist } = usePlaylists();
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [requestStatus, setRequestStatus] = useState('none'); // 'none', 'pending', 'approved'
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [sleepModalVisible, setSleepModalVisible] = useState(false);

    // Ensure dark navigation bar on Android
    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'android') {
                NavigationBar.setButtonStyleAsync('light');
            }
            checkRequestStatus();

            // Set up real-time sync for this track's status
            const channel = supabase
                .channel(`track_status_${currentTrack?.id}`)
                .on(
                    'postgres_changes',
                    { 
                        event: '*', 
                        schema: 'public', 
                        table: 'music_requests',
                        filter: `user_id=eq.${user?.id}`
                    },
                    (payload) => {
                        if (payload.new && payload.new.music_id === currentTrack?.id) {
                            setRequestStatus(payload.new.status);
                        } else if (payload.eventType === 'DELETE' && payload.old.music_id === currentTrack?.id) {
                            setRequestStatus('none');
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'download_permissions',
                        filter: `user_id=eq.${user?.id}`
                    },
                    (payload) => {
                        if (payload.eventType === 'INSERT' && payload.new.music_id === currentTrack?.id) {
                            setRequestStatus('approved');
                        } else if (payload.eventType === 'DELETE' && payload.old.music_id === currentTrack?.id) {
                            setRequestStatus('none');
                        }
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }, [currentTrack, user])
    );

    // Real-time status sync
    React.useEffect(() => {
        if (!currentTrack || !user) return;

        // Channel for music_requests
        const requestChannel = supabase
            .channel(`request_sync_${currentTrack.id}`)
            .on(
                'postgres_changes',
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'music_requests',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        checkRequestStatus();
                    } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        if (payload.new.music_id === currentTrack.id) {
                            // If it's approved, we still want to check permissions for granted_at
                            checkRequestStatus();
                        }
                    }
                }
            )
            .subscribe();

        // Channel for download_permissions
        const permChannel = supabase
            .channel(`perm_sync_${currentTrack.id}`)
            .on(
                'postgres_changes',
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'download_permissions',
                    filter: `user_id=eq.${user.id}`
                },
                () => {
                    // Re-check status on any permission change
                    checkRequestStatus();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(requestChannel);
            supabase.removeChannel(permChannel);
        };
    }, [currentTrack, user]);

    const checkRequestStatus = async () => {
        if (!currentTrack || !user) return;
        
        try {
            setCheckingStatus(true);
            
            // 1. Check permissions first
            const { data: permData } = await supabase
                .from('download_permissions')
                .select('*')
                .eq('user_id', user.id)
                .eq('music_id', currentTrack.id)
                .single();

            if (permData) {
                // Check if permission is older than 7 days
                const grantedAt = new Date(permData.granted_at);
                const now = new Date();
                const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
                
                if (now - grantedAt < sevenDaysInMs) {
                    setRequestStatus('approved');
                    return; // Valid permission found
                }
                // If expired, we don't return and let it fall through to check for a new pending request
            }
            
            // 2. Check requests
            const { data: reqData } = await supabase
                .from('music_requests')
                .select('status')
                .eq('user_id', user.id)
                .eq('music_id', currentTrack.id)
                .single();

            if (reqData) {
                if (reqData.status === 'approved') setRequestStatus('approved');
                else if (reqData.status === 'pending') setRequestStatus('pending');
                else setRequestStatus('none');
            } else {
                setRequestStatus('none');
            }
        } catch (error) {
            console.error('Error checking status:', error);
        } finally {
            setCheckingStatus(false);
        }
    };

    const handleRequestDownload = async () => {
        if (!user || !currentTrack) return;

        try {
            // Optimistic update
            setRequestStatus('pending');
            
            const { error } = await supabase
                .from('music_requests')
                .upsert({ user_id: user.id, music_id: currentTrack.id, status: 'pending' });

            if (error) {
                setRequestStatus('none');
                throw error;
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    const handleUndoRequest = async () => {
        if (!user || !currentTrack) return;

        try {
            setCheckingStatus(true);
            const { error } = await supabase
                .from('music_requests')
                .delete()
                .eq('user_id', user.id)
                .eq('music_id', currentTrack.id)
                .eq('status', 'pending');

            if (error) throw error;
            
            setRequestStatus('none');
        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setCheckingStatus(false);
        }
    };

    const handleDownload = async () => {
        if (!currentTrack) return;
        
        // If already downloading, cancel it
        if (downloading) {
            await cancelActiveDownload();
            setDownloading(false);
            setDownloadProgress(0);
            return;
        }

        try {
            setDownloading(true);
            setDownloadProgress(0);
            
            const result = await downloadMusicFile(
                currentTrack.audio_url, 
                currentTrack.title,
                currentTrack.id,
                (progress) => setDownloadProgress(progress)
            );

            if (result.success) {
                if (!result.alreadyExists) {
                    Alert.alert('Success', 'Music downloaded successfully!');
                }
            }
        } catch (error) {
            console.error('Download handler error:', error);
        } finally {
            setDownloading(false);
            setDownloadProgress(0);
        }
    };

    if (!currentTrack) {
        return (
            <View style={styles.container}>
                <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="close-outline" size={32} color="#fff" />
                </TouchableOpacity>
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No track playing</Text>
                </View>
            </View>
        );
    }

    const formatTime = (millis) => {
        if (!millis) return '0:00';
        const minutes = Math.floor(millis / 60000);
        const seconds = Math.floor((millis % 60000) / 1000);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const isFavorited = isFavorite(currentTrack.id);

    const handleAddToPlaylist = async (playlistId) => {
        const { error } = await addSongToPlaylist(playlistId, currentTrack.id);
        if (error) {
            Alert.alert(error.isDuplicate ? 'Note' : 'Error', error.message);
        } else {
            Alert.alert('Success', 'Added to playlist!');
            setPlaylistModalVisible(false);
        }
    };

    const [heartScale] = useState(new Animated.Value(1));

    const handleToggleFavorite = async () => {
        // Trigger animation
        Animated.sequence([
            Animated.timing(heartScale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
            Animated.spring(heartScale, { toValue: 1, friction: 4, useNativeDriver: true })
        ]).start();
        
        await toggleFavorite(currentTrack);
    };

    return (
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) + 100 }]}>
            <View style={[styles.header, { paddingTop: insets.top + 15 }]}>
                <TouchableOpacity style={styles.headerSpacer} onPress={() => navigation.goBack()}>
                    <Ionicons name="chevron-down" size={30} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Now Playing</Text>
                    {sleepSeconds > 0 && (
                        <View style={styles.timerBadge}>
                            <Ionicons name="moon" size={12} color="#1DB954" />
                            <Text style={styles.timerBadgeText}>
                                {Math.floor(sleepSeconds / 60)}:{(sleepSeconds % 60).toString().padStart(2, '0')}
                            </Text>
                        </View>
                    )}
                </View>
                <View style={styles.headerSpacer} />
            </View>

            <View style={[styles.coverContainer, { marginTop: 15 }]}>
                <Image source={{ uri: currentTrack.cover_url }} style={styles.cover} />
                {role !== 'admin' && (
                    <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                        <TouchableOpacity 
                            style={styles.heartOverlay} 
                            onPress={handleToggleFavorite}
                        >
                            <Ionicons 
                                name={isFavorited ? 'heart' : 'heart-outline'} 
                                size={28} 
                                color={isFavorited ? '#1DB954' : '#fff'} 
                            />
                        </TouchableOpacity>
                    </Animated.View>
                )}
            </View>

            <View style={styles.info}>
                <View style={styles.titleRow}>
                    <View style={styles.titleInfo}>
                        <Text style={styles.title} numberOfLines={1}>{currentTrack.title}</Text>
                        <Text style={styles.artist} numberOfLines={1}>
                            {currentTrack.artist} • <Text style={styles.genreText}>{currentTrack.genre || 'Music'}</Text>
                        </Text>
                    </View>
                    
                    {role !== 'admin' && (
                        <View style={styles.actionSection}>
                            {requestStatus === 'approved' ? (
                                <TouchableOpacity 
                                    style={[styles.downloadBtn, downloading && styles.downloadingBtn]} 
                                    onPress={handleDownload}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.downloadBtnContent}>
                                        <Ionicons 
                                            name={downloading ? "cloud-download" : "download-outline"} 
                                            size={16} 
                                            color="#FFFFFF" 
                                        />
                                        <Text style={styles.downloadBtnText}>
                                            {downloading ? `${Math.round(downloadProgress * 100)}%` : 'Download'}
                                        </Text>
                                        {downloading && <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 5 }} />}
                                    </View>
                                </TouchableOpacity>
                            ) : requestStatus === 'pending' ? (
                                <TouchableOpacity 
                                    style={styles.undoBtn} 
                                    onPress={handleUndoRequest}
                                    disabled={checkingStatus}
                                >
                                    <View style={styles.undoBtnContent}>
                                        <Ionicons name="time-outline" size={16} color="#1DB954" />
                                        <Text style={styles.undoBtnText}>Undo</Text>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity 
                                    style={styles.requestBtn} 
                                    onPress={handleRequestDownload}
                                    disabled={checkingStatus}
                                >
                                    <Ionicons name="cloud-download-outline" size={16} color="#aaa" />
                                    <Text style={styles.requestBtnText}>Request</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            </View>

            <View style={styles.progressSection}>
                <TouchableOpacity 
                    style={styles.progressBarContainer} 
                    activeOpacity={1}
                    onPress={(e) => {
                        const { locationX } = e.nativeEvent;
                        const progress = locationX / (width - 50); // width - padding
                        seek(progress * duration);
                    }}
                >
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${(position / duration) * 100 || 0}%` }]} />
                        <View style={[styles.progressHandle, { left: `${(position / duration) * 100 || 0}%` }]} />
                    </View>
                </TouchableOpacity>
                <View style={styles.timeLabels}>
                    <Text style={styles.timeText}>{formatTime(position)}</Text>
                    <Text style={styles.timeText}>{formatTime(duration)}</Text>
                </View>
                {role !== 'admin' && (
                    <View style={styles.timerRow}>
                        <TouchableOpacity style={styles.timerIconButton} onPress={() => setSleepModalVisible(true)}>
                            <Ionicons 
                                name={sleepSeconds > 0 ? "moon" : "moon-outline"} 
                                size={22} 
                                color={sleepSeconds > 0 ? "#1DB954" : "#666"} 
                            />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <View style={styles.controls}>
                <View style={styles.controlSlot}>
                    <TouchableOpacity onPress={toggleShuffle}>
                        <View style={styles.controlWithBadge}>
                            <Ionicons 
                                name="shuffle" 
                                size={26} 
                                color={isShuffle ? '#1DB954' : '#666'} 
                            />
                            {isShuffle && <View style={styles.activeDot} />}
                        </View>
                    </TouchableOpacity>
                </View>

                <View style={styles.controlSlot}>
                    <TouchableOpacity onPress={playPrev}>
                        <Ionicons name="play-skip-back" size={32} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={[styles.controlSlot, { flex: 1.5 }]}>
                    <TouchableOpacity style={styles.mainPlayBtn} onPress={togglePlayPause}>
                        {(isLoading || isBuffering) ? (
                            <ActivityIndicator size="large" color="#000" />
                        ) : (
                            <Ionicons 
                                name={isPlaying ? 'pause' : 'play'} 
                                size={40} 
                                color="#000" 
                                style={!isPlaying && { marginLeft: 4 }} 
                            />
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.controlSlot}>
                    <TouchableOpacity onPress={playNext}>
                        <Ionicons name="play-skip-forward" size={32} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={styles.controlSlot}>
                    <TouchableOpacity onPress={toggleRepeat}>
                        <View style={styles.controlWithBadge}>
                            <Ionicons 
                                name="repeat" 
                                size={26} 
                                color={repeatMode === 'none' ? '#666' : '#1DB954'} 
                            />
                            {repeatMode !== 'none' && <View style={styles.activeDot} />}
                            {repeatMode === 'one' && (
                                <View style={styles.repeatBadge}>
                                    <Text style={styles.repeatBadgeText}>1</Text>
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.footerActions}>
                <TouchableOpacity style={styles.footerBtn} onPress={() => seek(0)}>
                    <Ionicons name="refresh-outline" size={22} color="#aaa" />
                </TouchableOpacity>

                {role !== 'admin' && (
                    <TouchableOpacity style={styles.footerBtn} onPress={() => setPlaylistModalVisible(true)}>
                        <Text style={styles.footerMoreBtnText}>≡+</Text>
                    </TouchableOpacity>
                )}
            </View>

            <Modal
                animationType="slide"
                transparent={true}
                visible={playlistModalVisible}
                onRequestClose={() => setPlaylistModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add to Playlist</Text>
                            <TouchableOpacity onPress={() => setPlaylistModalVisible(false)}>
                                <Ionicons name="close-outline" size={28} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        
                        <FlatList
                            data={playlists}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    style={styles.playlistItem}
                                    onPress={() => handleAddToPlaylist(item.id)}
                                >
                                    <View style={styles.playlistIconSmall}>
                                        <Text>🎶</Text>
                                    </View>
                                    <Text style={styles.playlistName}>{item.name}</Text>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <Text style={styles.emptyPlaylistsText}>No playlists created yet.</Text>
                            }
                        />
                    </View>
                </View>
            </Modal>

            {/* Sleep Timer Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={sleepModalVisible}
                onRequestClose={() => setSleepModalVisible(false)}
            >
                <TouchableOpacity 
                    style={styles.modalOverlay} 
                    activeOpacity={1} 
                    onPress={() => setSleepModalVisible(false)}
                >
                    <View style={styles.timerModalContent}>
                        <Text style={styles.modalTitle}>Sleep timer</Text>
                        <View style={styles.timerOptions}>
                            {[5, 10, 15, 30, 45, 60].map(mins => (
                                <TouchableOpacity 
                                    key={mins}
                                    style={styles.timerOption}
                                    onPress={() => {
                                        setSleepSeconds(mins * 60);
                                        setSleepModalVisible(false);
                                    }}
                                >
                                    <Text style={styles.timerOptionText}>{mins === 60 ? '1hr' : `${mins} minutes`}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity 
                                style={[styles.timerOption, { borderBottomWidth: 0 }]}
                                onPress={() => {
                                    setSleepSeconds(0);
                                    setSleepModalVisible(false);
                                }}
                            >
                                <Text style={[styles.timerOptionText, { color: '#ff4444' }]}>Turn off timer</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        paddingHorizontal: 25,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 15,
    },
    headerSpacer: {
        width: 40,
    },
    moreBtn: {
        width: 40,
        alignItems: 'center',
    },
    headerTitleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    footerActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 20,
        width: '100%',
    },
    footerBtn: {
        padding: 5,
    },
    footerMoreBtnText: {
        color: '#aaa',
        fontSize: 22,
    },
    timerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(29, 185, 84, 0.1)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        marginTop: 4,
    },
    timerBadgeText: {
        color: '#1DB954',
        fontSize: 10,
        fontWeight: 'bold',
        marginLeft: 4,
    },
    moreBtnText: {
        color: '#fff',
        fontSize: 24,
    },
    coverContainer: {
        width: '100%',
        aspectRatio: 1,
        marginTop: 10,
        borderRadius: 20,
        overflow: 'hidden',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
    },
    cover: {
        width: '100%',
        height: '100%',
        backgroundColor: '#333',
    },
    info: {
        marginTop: 10,
        width: '100%',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },
    titleInfo: {
        flex: 1,
        marginRight: 10,
    },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
    },
    artist: {
        color: '#aaa',
        fontSize: 14,
        marginTop: 2,
    },
    genreText: {
        color: '#1DB954',
        fontWeight: 'bold',
        fontSize: 12,
    },
    actionSection: {
        marginLeft: 10,
    },
    downloadBtn: {
        backgroundColor: '#1DB954',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 8,
    },
    downloadBtnContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    downloadBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 6,
    },
    downloadingBtn: {
        backgroundColor: '#282828',
        borderWidth: 1,
        borderColor: '#1DB954',
    },
    requestBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#282828',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#333',
    },
    requestBtnText: {
        color: '#aaa',
        fontSize: 14,
        marginLeft: 6,
        fontWeight: '600',
    },
    undoBtn: {
        backgroundColor: '#282828',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#1DB954',
    },
    undoBtnContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    undoBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 6,
    },
    requestContainer: {
        marginTop: 15,
    },
    requestBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#282828',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#333',
    },
    requestBtnText: {
        color: '#aaa',
        fontSize: 14,
        marginLeft: 8,
        fontWeight: '600',
    },
    pendingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    pendingText: {
        color: '#1DB954',
        fontSize: 14,
        marginLeft: 8,
        fontWeight: 'bold',
    },
    pendingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    undoBtn: {
        marginLeft: 15,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: '#333',
    },
    undoBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    downloadBtn: {
        backgroundColor: '#1DB954',
        borderRadius: 30,
        elevation: 5,
        minWidth: 160,
        paddingVertical: 12,
        paddingHorizontal: 25,
    },
    downloadBtnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    downloadingBtn: {
        backgroundColor: '#282828', // Darker background when downloading
        borderWidth: 1,
        borderColor: '#1DB954',
    },
    downloadProgressBg: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        backgroundColor: '#1DB954',
        opacity: 0.3, // Subtle overlay
    },
    downloadBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        marginLeft: 10,
        fontWeight: 'bold',
    },
    downloadingBtnText: {
        color: '#FFFFFF',
    },
    controlWithBadge: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    activeDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#1DB954',
        marginTop: 4,
        position: 'absolute',
        bottom: -8,
    },
    heartOverlay: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 12,
        borderRadius: 30,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    progressSection: {
        marginTop: 15,
        width: '100%',
    },
    progressBarContainer: {
        width: '100%',
        height: 20,
        justifyContent: 'center',
    },
    progressBar: {
        width: '100%',
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        position: 'relative',
    },
    progressHandle: {
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#1DB954',
        top: -4,
        marginLeft: -6,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#1DB954',
        borderRadius: 2,
    },
    timeLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    timeText: {
        color: '#aaa',
        fontSize: 12,
        fontWeight: '600',
    },
    timerRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 0,
        paddingRight: 5,
    },
    timerIconButton: {
        padding: 8,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        width: '100%',
    },
    controlSlot: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sideBtn: {
        padding: 5,
        width: 44,
        alignItems: 'center',
    },
    secondaryBtn: {
        padding: 5,
        width: 50,
        alignItems: 'center',
    },
    mainPlayBtn: {
        width: 80,
        height: 80,
        backgroundColor: '#1DB954',
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 10,
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
    },
    emptyText: {
        color: '#aaa',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 100,
    },
    closeBtn: {
        alignSelf: 'flex-start',
        marginTop: 20,
    },
    closeBtnText: {
        display: 'none'
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1E1E1E',
        height: height * 0.6,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 25,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 25,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    closeModalText: {
        color: '#fff',
        fontSize: 22,
    },
    timerModalContent: {
        backgroundColor: '#282828',
        width: width * 0.8,
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
    },
    timerOptions: {
        width: '100%',
        marginTop: 20,
    },
    timerOption: {
        paddingVertical: 15,
        width: '100%',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    timerOptionText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    playlistItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#282828',
    },
    playlistIconSmall: {
        width: 40,
        height: 40,
        backgroundColor: '#333',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    playlistName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    emptyPlaylistsText: {
        color: '#aaa',
        textAlign: 'center',
        marginTop: 50,
        fontSize: 16,
    },
    repeatBadge: {
        position: 'absolute',
        top: -2,
        right: -5,
        backgroundColor: '#1DB954',
        borderRadius: 8,
        width: 14,
        height: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#000000',
    },
    repeatBadgeText: {
        color: '#000',
        fontSize: 9,
        fontWeight: 'bold',
    }
});

export default MusicPlayerScreen;
