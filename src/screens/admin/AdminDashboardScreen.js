import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image, Platform, RefreshControl } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import { useMenu } from '../../context/MenuContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SkeletonCard from '../../components/SkeletonCard';
import PlayingVisualizer from '../../components/PlayingVisualizer';

const AdminDashboardScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { openMenu, refreshStorageUsage } = useMenu();
    const { playTrack, currentTrack, isPlaying, togglePlayPause, loadingTrackId } = usePlayer();
    const [activeTab, setActiveTab] = useState('Music'); // 'Music' or 'Requests'
    const [music, setMusic] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'android') {
                NavigationBar.setButtonStyleAsync('light');
            }
        }, [])
    );

    useEffect(() => {
        fetchData();

        // Set up real-time subscription for requests
        const subscription = supabase
            .channel('admin_requests_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'music_requests' },
                () => {
                    // Refresh requests on any change (insert, update, delete)
                    fetchRequests();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    // Refresh when active tab changes, but requests are now tracked in real-time
    useEffect(() => {
        if (activeTab === 'Music' && music.length === 0) {
            fetchMusic();
        }
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([
            fetchMusic(),
            fetchRequests()
        ]);
        setLoading(false);
        setRefreshing(false);
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [activeTab]);

    const fetchMusic = async () => {
        try {
            const { data, error } = await supabase
                .from('music')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMusic(data);
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    const fetchRequests = async () => {
        try {
            const { data, error } = await supabase
                .from('music_requests')
                .select(`
                    *,
                    profiles:user_id (full_name),
                    music:music_id (title, artist, cover_url)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setRequests(data);
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    const handleCardPress = (track) => {
        if (currentTrack?.id !== track.id) {
            playTrack(track, music, { type: 'admin_dashboard' });
        }
        navigation.navigate('Player');
    };

    const handleTogglePlay = (track) => {
        if (currentTrack?.id === track.id) {
            togglePlayPause();
        } else {
            playTrack(track, music, { type: 'admin_dashboard' });
        }
    };

    const handleDelete = async (id, title) => {
        Alert.alert(
            "Delete Track",
            `Are you sure you want to permanently delete "${title}" and its storage files?`,
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Delete", 
                    style: "destructive", 
                    onPress: async () => {
                        try {
                            // 1. Fetch track details to get file paths BEFORE deleting from DB
                            const { data: track, error: fetchErr } = await supabase
                                .from('music')
                                .select('audio_url, cover_url')
                                .eq('id', id)
                                .single();
                            
                            if (fetchErr) throw fetchErr;

                            // 2. Delete from DB
                            const { error: dbError } = await supabase.from('music').delete().eq('id', id);
                            if (dbError) throw dbError;

                            // 3. Delete from Storage
                            if (track) {
                                // Extract filenames from URLs (assuming standard Supabase public URL structure)
                                const audioFile = track.audio_url?.split('/').pop();
                                const coverFile = track.cover_url?.split('/').pop();

                                if (audioFile) {
                                    await supabase.storage.from('music-files').remove([audioFile]);
                                }
                                if (coverFile) {
                                    await supabase.storage.from('cover-images').remove([coverFile]);
                                }
                            }

                            Alert.alert('Success', `"${title}" and its files have been removed.`);
                            await refreshStorageUsage();
                            fetchMusic();
                        } catch (error) {
                            Alert.alert('Error', error.message);
                        }
                    } 
                }
            ]
        );
    };

    const handleRequestAction = async (requestId, status, userId, musicId) => {
        try {
            if (status === 'rejected') {
                // Remove request
                const { error: delError } = await supabase
                    .from('music_requests')
                    .delete()
                    .eq('id', requestId);
                
                if (delError) throw delError;

                // Also revoke download permission if it exists
                await supabase
                    .from('download_permissions')
                    .delete()
                    .eq('user_id', userId)
                    .eq('music_id', musicId);
                
                Alert.alert('Success', 'Request rejected and removed.');
            } else {
                // Update request status (for approved)
                const { error: requestError } = await supabase
                    .from('music_requests')
                    .update({ status })
                    .eq('id', requestId);

                if (requestError) throw requestError;

                // If approved, grant download permission
                if (status === 'approved') {
                    const { error: permError } = await supabase
                        .from('download_permissions')
                        .upsert({ user_id: userId, music_id: musicId });

                    if (permError) throw permError;
                }
                Alert.alert('Success', `Request ${status} successfully`);
            }
            fetchRequests();
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    const handleDeleteRequest = async (id) => {
        Alert.alert(
            "Delete Request",
            "Remove this request from history?",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Delete", 
                    style: "destructive", 
                    onPress: async () => {
                        const { error } = await supabase.from('music_requests').delete().eq('id', id);
                        if (error) Alert.alert('Error', error.message);
                        else fetchRequests();
                    } 
                }
            ]
        );
    };

    const handleClearHistory = async () => {
        if (requests.length === 0) {
            Alert.alert("Clean Dashboard", "There is no history to clear yet!");
            return;
        }

        Alert.alert(
            "Clear All History",
            `Are you sure you want to permanently remove all ${requests.length} requests? This includes pending ones. Users will need to request again.`,
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Clear All", 
                    style: "destructive", 
                    onPress: async () => {
                        // 1. Delete all requests
                        const { error: reqError } = await supabase
                            .from('music_requests')
                            .delete()
                            .neq('id', '00000000-0000-0000-0000-000000000000');
                        
                        if (reqError) {
                            Alert.alert('Error clearing requests', reqError.message);
                            return;
                        }

                        // 2. Delete all download permissions
                        const { error: permError } = await supabase
                            .from('download_permissions')
                            .delete()
                            .neq('id', '00000000-0000-0000-0000-000000000000');
                        
                        if (permError) {
                            Alert.alert('Error clearing permissions', permError.message);
                        } else {
                            fetchRequests();
                        }
                    } 
                }
            ]
        );
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const renderMusicCard = ({ item }) => {
        const isCurrent = currentTrack?.id === item.id;
        const isAnyPlaying = !!currentTrack;

        return (
            <TouchableOpacity 
                style={[
                    styles.musicCard,
                    isCurrent && styles.activeCard,
                    isAnyPlaying && !isCurrent && styles.inactiveCard
                ]}
                onPress={() => handleCardPress(item)}
            >
                <View style={[styles.thumbnailContainer, { height: 150, overflow: 'hidden' }]}>
                    <Image source={{ uri: item.cover_url }} style={styles.trackCover} />
                    {currentTrack?.id === item.id && (
                        <View style={styles.visualizerOverlay}>
                            <PlayingVisualizer isPlaying={isPlaying} />
                        </View>
                    )}
                    <TouchableOpacity 
                        style={styles.playOverlay}
                        onPress={() => handleTogglePlay(item)}
                    >
                        {loadingTrackId === item.id ? (
                            <ActivityIndicator size="small" color="#000" />
                        ) : (
                            <Ionicons 
                                name={currentTrack?.id === item.id && isPlaying ? 'pause' : 'play'} 
                                size={18} 
                                color="#000" 
                                style={!(currentTrack?.id === item.id && isPlaying) && { marginLeft: 2 }}
                            />
                        )}
                    </TouchableOpacity>
                </View>
                <TouchableOpacity 
                    style={styles.deleteAction}
                    onPress={() => handleDelete(item.id, item.title)}
                >
                    <Ionicons name="trash-outline" size={18} color="#FF4136" />
                </TouchableOpacity>
                <View style={styles.cardInfo}>
                    <Text style={[styles.musicTitle, currentTrack?.id === item.id && { color: '#1DB954' }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={styles.musicArtist} numberOfLines={1}>{item.artist}</Text>
                    <View style={styles.cardFooter}>
                        <View style={styles.footerTop}>
                            <View style={styles.genreBadge}>
                                <Text style={styles.genreText}>{item.genre}</Text>
                            </View>
                        </View>
                        <Text style={styles.releaseDate}>{formatDate(item.created_at)}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const renderRequestItem = ({ item }) => (
        <View style={styles.requestItem}>
            <Image source={{ uri: item.music?.cover_url }} style={styles.requestCover} />
            <View style={styles.requestInfo}>
                <Text style={styles.requestUser}>{item.profiles?.full_name}</Text>
                <Text style={styles.requestSong} numberOfLines={1}>wants "{item.music?.title}"</Text>
                <Text style={styles.requestDate}>{formatDate(item.created_at)}</Text>
            </View>
            {item.status === 'pending' ? (
                <View style={styles.requestActions}>
                    <TouchableOpacity 
                        style={[styles.actionBtn, styles.approveBtn]}
                        onPress={() => handleRequestAction(item.id, 'approved', item.user_id, item.music_id)}
                    >
                        <Ionicons name="checkmark" size={20} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.actionBtn, styles.rejectBtn]}
                        onPress={() => handleRequestAction(item.id, 'rejected', item.user_id, item.music_id)}
                    >
                        <Ionicons name="close" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.processedContainer}>
                    <View style={[styles.statusBadge, item.status === 'approved' ? styles.approvedBadge : styles.rejectedBadge]}>
                        <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                    </View>
                    <TouchableOpacity 
                        style={styles.deleteRequestBtn} 
                        onPress={() => handleDeleteRequest(item.id)}
                    >
                        <Ionicons name="trash-outline" size={16} color="#666" />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <View style={styles.exploreCard}>
                    <TouchableOpacity style={styles.menuButton} onPress={openMenu}>
                        <Ionicons name="menu-outline" size={28} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.exploreTextContainer}>
                        <Text style={styles.title}>Admin Panel</Text>
                        <Text style={styles.subtitle}>Control Center</Text>
                    </View>
                </View>
            </View>

            <View style={styles.tabBar}>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'Music' && styles.activeTab]}
                    onPress={() => setActiveTab('Music')}
                >
                    <Ionicons name="musical-notes-outline" size={20} color={activeTab === 'Music' ? '#1DB954' : '#666'} />
                    <Text style={[styles.tabText, activeTab === 'Music' && styles.activeTabText]}>My Music</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'Requests' && styles.activeTab]}
                    onPress={() => setActiveTab('Requests')}
                >
                    <View>
                        <Ionicons name="notifications-outline" size={20} color={activeTab === 'Requests' ? '#1DB954' : '#666'} />
                        {requests.filter(r => r.status === 'pending').length > 0 && <View style={styles.notifDot} />}
                    </View>
                    <Text style={[styles.tabText, activeTab === 'Requests' && styles.activeTabText]}>Requests</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.list}>
                    {activeTab === 'Music' ? (
                        <>
                            <View style={styles.row}>
                                <SkeletonCard />
                                <SkeletonCard />
                            </View>
                            <View style={styles.row}>
                                <SkeletonCard />
                                <SkeletonCard />
                            </View>
                        </>
                    ) : (
                        <View style={{ paddingHorizontal: 15 }}>
                            <View style={[styles.requestItem, { opacity: 0.5, height: 80, backgroundColor: '#1E1E1E' }]} />
                            <View style={[styles.requestItem, { opacity: 0.5, height: 80, backgroundColor: '#1E1E1E' }]} />
                            <View style={[styles.requestItem, { opacity: 0.5, height: 80, backgroundColor: '#1E1E1E' }]} />
                        </View>
                    )}
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    {activeTab === 'Requests' && requests.length > 0 && (
                        <TouchableOpacity style={styles.clearHistoryBar} onPress={handleClearHistory}>
                            <Ionicons name="trash-bin-outline" size={16} color="#aaa" />
                            <Text style={styles.clearHistoryText}>Clear All History</Text>
                        </TouchableOpacity>
                    )}
                    <FlatList
                        data={activeTab === 'Music' ? music : requests}
                        keyExtractor={(item) => item.id}
                        renderItem={activeTab === 'Music' ? renderMusicCard : renderRequestItem}
                        numColumns={activeTab === 'Music' ? 2 : 1}
                        key={activeTab} // Force re-render grid/list
                        columnWrapperStyle={activeTab === 'Music' ? styles.row : null}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons 
                                    name={activeTab === 'Music' ? "musical-notes-outline" : "notifications-off-outline"} 
                                    size={60} 
                                    color="#282828" 
                                />
                                <Text style={styles.emptyText}>Nothing here yet.</Text>
                                <Text style={styles.emptySubtext}>
                                    {activeTab === 'Music' ? "Start by uploading your first track!" : "You're all caught up with user requests."}
                                </Text>
                            </View>
                        }
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor="#1DB954"
                                colors={["#1DB954"]}
                            />
                        }
                    />
                </View>
            )}

            <TouchableOpacity 
                style={styles.fab} 
                onPress={() => navigation.navigate('UploadMusic')}
            >
                <Ionicons name="cloud-upload-outline" size={28} color="#000" />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        marginBottom: 20,
        paddingHorizontal: 15,
    },
    exploreCard: {
        backgroundColor: '#1E1E1E',
        borderRadius: 20,
        padding: 15,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    menuButton: {
        width: 44,
        height: 44,
        backgroundColor: '#282828',
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    exploreTextContainer: {
        flex: 1,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 14,
        fontWeight: '500',
        color: '#1DB954',
    },
    releaseDate: {
        color: '#666',
        fontSize: 9,
        fontStyle: 'italic',
        marginTop: 4,
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 15,
        marginBottom: 20,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        backgroundColor: '#1E1E1E',
        borderRadius: 15,
        marginHorizontal: 5,
        borderWidth: 1,
        borderColor: '#282828',
    },
    activeTab: {
        borderColor: '#1DB954',
        backgroundColor: '#181818',
    },
    tabText: {
        color: '#666',
        fontWeight: 'bold',
        marginLeft: 8,
    },
    activeTabText: {
        color: '#fff',
    },
    notifDot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF4136',
    },
    row: {
        justifyContent: 'space-between',
        paddingHorizontal: 15,
    },
    list: {
        paddingBottom: 100,
    },
    musicCard: {
        backgroundColor: '#1E1E1E',
        width: '46%',
        borderRadius: 15,
        marginBottom: 15,
        marginHorizontal: '2%',
        overflow: 'hidden',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        borderWidth: 1,
        borderColor: '#282828',
    },
    activeCard: {
        borderColor: '#1DB954',
        borderWidth: 2,
        elevation: 15,
        shadowColor: '#1DB954',
        shadowOpacity: 0.4,
        shadowRadius: 10,
        zIndex: 2,
    },
    inactiveCard: {
        opacity: 0.6,
    },
    thumbnailContainer: {
        position: 'relative',
    },
    trackCover: {
        width: '100%',
        height: 150,
        backgroundColor: '#333',
    },
    playOverlay: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    },
    visualizerOverlay: {
        position: 'absolute',
        bottom: 5,
        left: 5,
        zIndex: 10,
    },
    deleteAction: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardInfo: {
        padding: 12,
    },
    musicTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    musicArtist: {
        color: '#aaa',
        fontSize: 12,
        marginTop: 2,
    },
    cardFooter: {
        marginTop: 8,
    },
    footerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    genreBadge: {
        backgroundColor: '#282828',
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginTop: 8,
    },
    genreText: {
        color: '#1DB954',
        fontSize: 9,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    requestItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E1E',
        marginHorizontal: 15,
        marginBottom: 12,
        padding: 12,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#282828',
    },
    requestCover: {
        width: 50,
        height: 50,
        borderRadius: 8,
        backgroundColor: '#333',
    },
    requestInfo: {
        flex: 1,
        marginLeft: 12,
    },
    requestUser: {
        color: '#fff',
        fontSize: 15,
        fontWeight: 'bold',
    },
    requestSong: {
        color: '#aaa',
        fontSize: 13,
        marginTop: 2,
    },
    requestDate: {
        color: '#666',
        fontSize: 11,
        marginTop: 4,
    },
    requestActions: {
        flexDirection: 'row',
    },
    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
    approveBtn: {
        backgroundColor: '#1DB954',
    },
    rejectBtn: {
        backgroundColor: '#333',
    },
    processedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    approvedBadge: {
        backgroundColor: 'rgba(29, 185, 84, 0.1)',
        borderWidth: 1,
        borderColor: '#1DB954',
    },
    rejectedBadge: {
        backgroundColor: 'rgba(255, 65, 54, 0.1)',
        borderWidth: 1,
        borderColor: '#FF4136',
    },
    statusText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#fff',
    },
    deleteRequestBtn: {
        marginLeft: 10,
        padding: 5,
    },
    clearHistoryBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginHorizontal: 15,
        marginBottom: 10,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#333',
    },
    clearHistoryText: {
        color: '#aaa',
        fontSize: 12,
        marginLeft: 6,
        fontWeight: '500',
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 30,
        backgroundColor: '#1DB954',
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 10,
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
        paddingHorizontal: 40,
    },
    emptyText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 15,
        opacity: 0.9,
    },
    emptySubtext: {
        color: '#666',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
});

export default AdminDashboardScreen;
