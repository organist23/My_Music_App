import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image, Platform, RefreshControl, TextInput, LayoutAnimation, UIManager, Animated } from 'react-native';
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

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AdminDashboardScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { openMenu, refreshStorageUsage } = useMenu();
    const { 
        playTrack, currentTrack, isPlaying, togglePlayPause, 
        loadingTrackId, isBuffering, reconnectIfStalled, syncQueue 
    } = usePlayer();
    const [activeTab, setActiveTab] = useState('Music'); // 'Music' or 'Requests'
    const [music, setMusic] = useState([]);
    const [genres, setGenres] = useState(['All']);
    const [selectedGenre, setSelectedGenre] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pendingDeletions, setPendingDeletions] = useState(new Set());
    const skeletonOpacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        if (loading) {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(skeletonOpacity, {
                        toValue: 0.7,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(skeletonOpacity, {
                        toValue: 0.3,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            );
            pulse.start();
            return () => pulse.stop();
        }
    }, [loading]);

    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'android') {
                NavigationBar.setButtonStyleAsync('light');
            }
            // Only show major loader if the main music list is empty
            fetchData(music.length === 0);
        }, [music.length])
    );

    useEffect(() => {
        // We rely on useFocusEffect for the initial load.
        // We set up real-time subscriptions here once.

        // Set up real-time subscription for music deletion/updates
        const musicSubscription = supabase
            .channel('admin_music_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'music' },
                () => {
                    fetchMusic(true); // pass true to indicate we want animation
                }
            )
            .subscribe();

        // Set up real-time subscription for requests
        const requestSubscription = supabase
            .channel('admin_requests_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'music_requests' },
                () => {
                    fetchRequests();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(musicSubscription);
            supabase.removeChannel(requestSubscription);
        };
    }, []);

    // Refresh when active tab changes if data is missing
    useEffect(() => {
        if (activeTab === 'Music' && music.length === 0 && !loading) {
            fetchMusic();
        }
    }, [activeTab]);

    const fetchData = async (showLoading = true) => {
        if (showLoading && music.length === 0) setLoading(true);
        try {
            await Promise.all([
                fetchMusic(),
                fetchRequests()
            ]);
        } catch (error) {
            console.error('Admin fetchData error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [activeTab]);

    const fetchMusic = async (withAnimation = false) => {
        try {
            const { data, error } = await supabase
                .from('music')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            if (withAnimation) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            }
            
            // Filter out items that are currently being deleted
            const filteredData = (data || []).filter(item => !pendingDeletions.has(item.id));
            setMusic(filteredData);
            
            // Sync the queue if we are playing from the admin dashboard context
            syncQueue(filteredData, { type: 'admin_dashboard' });
            
            // If the user manually pulled to refresh, try to reconnect any stalled audio
            if (refreshing) {
                reconnectIfStalled();
            }
            
            const uniqueGenres = ['All', ...new Set((data || []).map(item => item.genre))];
            setGenres(uniqueGenres);
        } catch (error) {
            if (!withAnimation) { // Don't show alert for background sync failures unless it's initial load
                Alert.alert('Error', error.message);
            }
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

            // De-duplicate: if there are multiple rows for the same (user_id, music_id),
            // keep only the most recent one (first one since we ordered DESC)
            const seen = new Set();
            const deduped = (data || []).filter(item => {
                const key = `${item.user_id}_${item.music_id}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            setRequests(deduped);
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
                            // Track deletion ID to prevent reappearing during sync
                            setPendingDeletions(prev => new Set(prev).add(id));

                            // Optimistic UI update with animation
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setMusic(prev => prev.filter(m => m.id !== id));

                            // 1. Fetch track details to get file paths BEFORE deleting from DB
                            const { data: track, error: fetchErr } = await supabase
                                .from('music')
                                .select('audio_url, cover_url')
                                .eq('id', id)
                                .single();
                            
                            if (fetchErr) throw fetchErr;

                            // 2. Delete from DB
                            const { error: dbError } = await supabase.from('music').delete().eq('id', id);
                            if (dbError) {
                                // If error, remove from pending and revert UI
                                setPendingDeletions(prev => {
                                    const next = new Set(prev);
                                    next.delete(id);
                                    return next;
                                });
                                fetchMusic(true);
                                throw dbError;
                            }

                            // 3. Delete from Storage
                            if (track) {
                                const audioFile = track.audio_url?.split('/').pop();
                                const coverFile = track.cover_url?.split('/').pop();

                                if (audioFile) {
                                    await supabase.storage.from('music-files').remove([audioFile]);
                                }
                                if (coverFile) {
                                    await supabase.storage.from('cover-images').remove([coverFile]);
                                }
                            }

                            await refreshStorageUsage();

                            // Keep in pendingDeletions for a short grace period (3 seconds) 
                            // to ensure real-time triggers don't fetch it back too early
                            setTimeout(() => {
                                setPendingDeletions(prev => {
                                    const next = new Set(prev);
                                    next.delete(id);
                                    return next;
                                });
                            }, 3000);

                        } catch (error) {
                            Alert.alert('Error', error.message);
                            setPendingDeletions(prev => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                            });
                            fetchMusic(true);
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
                // Update request status to approved
                const { error: requestError } = await supabase
                    .from('music_requests')
                    .update({ status })
                    .eq('id', requestId);

                if (requestError) throw requestError;

                // If approved, grant (or refresh) download permission
                // Delete old permission first so granted_at is reset to NOW()
                if (status === 'approved') {
                    await supabase
                        .from('download_permissions')
                        .delete()
                        .eq('user_id', userId)
                        .eq('music_id', musicId);

                    const { error: permError } = await supabase
                        .from('download_permissions')
                        .insert({ user_id: userId, music_id: musicId });

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
        const totalCount = requests.length;
        if (totalCount === 0) {
            Alert.alert("Clean Dashboard", "There are no requests to clear yet!");
            return;
        }

        const pendingCount = requests.filter(r => r.status === 'pending').length;

        Alert.alert(
            "Clear Request History",
            pendingCount > 0 
                ? `This will remove ALL ${totalCount} requests, including ${pendingCount} still pending. Users will need to request again.`
                : `Remove all ${totalCount} processed requests from history?`,
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Clear All", 
                    style: "destructive", 
                    onPress: async () => {
                        try {
                            // 1. Delete all requests
                            const { error: reqError } = await supabase
                                .from('music_requests')
                                .delete()
                                .neq('id', '00000000-0000-0000-0000-000000000000');
                            
                            if (reqError) throw reqError;

                            // Note: We NO LONGER delete from download_permissions here
                            // to preserve the user's 7-day download access window.

                            Alert.alert('Success', 'Request history cleared. (Active permissions preserved)');
                            fetchRequests();
                        } catch (error) {
                            Alert.alert('Error clearing history', error.message);
                        }
                    } 
                }
            ]
        );
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return `${day} • ${time}`;
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
                <View style={[styles.thumbnailContainer, { overflow: 'hidden' }]}>
                    <Image source={{ uri: item.cover_url }} style={styles.trackCover} resizeMode="cover" />
                    
                    {/* Overlay Info Container */}
                    <View style={[styles.cardOverlay, isCurrent && styles.activeCardOverlay]}>
                        <View style={styles.cardInfo}>
                            {currentTrack?.id === item.id && (
                                <View style={styles.visualizerContainer}>
                                    <PlayingVisualizer isPlaying={isPlaying && !isBuffering} />
                                </View>
                            )}
                            <Text 
                                style={[styles.musicTitle, isCurrent && { color: '#1DB954' }]} 
                                numberOfLines={1}
                            >
                                {item.title}
                            </Text>
                            <Text style={styles.musicArtist} numberOfLines={1}>
                                {item.artist} <Text style={styles.artistDot}>•</Text> {item.genre}
                            </Text>
                            <Text style={styles.releaseDate}>{formatDate(item.created_at)}</Text>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={styles.deleteAction}
                        onPress={() => handleDelete(item.id, item.title)}
                    >
                        <Ionicons name="trash-outline" size={13} color="#FF4136" />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={styles.playOverlay}
                        onPress={() => handleTogglePlay(item)}
                    >
                        {(loadingTrackId === item.id || (isCurrent && isBuffering)) ? (
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

    const filteredMusic = music.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             item.artist.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesGenre = selectedGenre === 'All' || item.genre === selectedGenre;
        return matchesSearch && matchesGenre;
    });

    const renderGenreItem = ({ item }) => (
        <TouchableOpacity 
            style={[
                styles.genreChip, 
                selectedGenre === item && styles.activeGenreChip
            ]}
            onPress={() => setSelectedGenre(item)}
        >
            <Text style={[
                styles.genreText,
                selectedGenre === item && styles.activeGenreText
            ]}>{item}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 5, paddingHorizontal: 15 }]}>
                <View style={styles.exploreCard}>
                    <TouchableOpacity 
                        style={styles.menuButton} 
                        onPress={openMenu}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="menu-outline" size={26} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.exploreTextContainer}>
                        <Text style={styles.title}>Admin Panel</Text>
                    </View>
                    <Image 
                        source={require('../../../logo/login.png')} 
                        style={styles.headerLogo}
                    />
                </View>
            </View>

            <View style={[styles.tabBar, { paddingHorizontal: 15 }]}>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'Music' && styles.activeTab]}
                    onPress={() => setActiveTab('Music')}
                >
                    <Ionicons name="musical-notes-outline" size={18} color={activeTab === 'Music' ? '#1DB954' : '#666'} />
                    <Text style={[styles.tabText, activeTab === 'Music' && styles.activeTabText]}>My Music</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'Requests' && styles.activeTab]}
                    onPress={() => setActiveTab('Requests')}
                >
                    <View>
                        <Ionicons name="notifications-outline" size={18} color={activeTab === 'Requests' ? '#1DB954' : '#666'} />
                        {requests.filter(r => r.status === 'pending').length > 0 && (
                            <View style={styles.notifBadge}>
                                <Text style={styles.notifText}>
                                    {requests.filter(r => r.status === 'pending').length}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={[styles.tabText, activeTab === 'Requests' && styles.activeTabText]}>Requests</Text>
                </TouchableOpacity>
            </View>

            {!loading && (
                <View style={{ flexGrow: 0 }}>
                    {activeTab === 'Music' ? (
                        <View style={styles.filterSection}>
                            <View style={styles.searchBox}>
                                <Ionicons name="search-outline" size={16} color="#666" style={styles.searchIcon} />
                                <TextInput
                                    style={styles.compactSearchInput}
                                    placeholder="Search music..."
                                    placeholderTextColor="#666"
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                {searchQuery.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                                        <Ionicons name="close-circle" size={16} color="#666" />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <FlatList
                                data={genres}
                                keyExtractor={(item) => item}
                                renderItem={renderGenreItem}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.compactGenreList}
                            />
                        </View>
                    ) : (
                        requests.length > 0 && (
                            <TouchableOpacity style={styles.clearHistoryBar} onPress={handleClearHistory}>
                                <Ionicons name="trash-bin-outline" size={16} color="#aaa" />
                                <Text style={styles.clearHistoryText}>Clear All History</Text>
                            </TouchableOpacity>
                        )
                    )}
                </View>
            )}

            {loading ? (
                <FlatList
                    data={[1, 2, 3, 4, 5, 6]}
                    keyExtractor={(item) => `skeleton-${item}`}
                    style={{ flex: 1 }}
                    contentContainerStyle={[styles.list, activeTab === 'Requests' && { paddingHorizontal: 15 }]}
                    renderItem={() => (
                        activeTab === 'Music' ? (
                            <View style={styles.row}>
                                <SkeletonCard />
                                <SkeletonCard />
                            </View>
                        ) : (
                            <View style={[styles.requestItem, { backgroundColor: '#1E1E1E', marginBottom: 12 }]}>
                                <Animated.View style={[styles.requestCover, { backgroundColor: '#333', opacity: skeletonOpacity }]} />
                                <View style={styles.requestInfo}>
                                    <Animated.View style={{ height: 16, width: '50%', backgroundColor: '#444', borderRadius: 4, marginBottom: 8, opacity: skeletonOpacity }} />
                                    <Animated.View style={{ height: 12, width: '80%', backgroundColor: '#3a3a3a', borderRadius: 3, marginBottom: 10, opacity: skeletonOpacity }} />
                                    <Animated.View style={{ height: 10, width: '30%', backgroundColor: '#282828', borderRadius: 2, opacity: skeletonOpacity }} />
                                </View>
                            </View>
                        )
                    )}
                />
            ) : activeTab === 'Music' ? (
                <FlatList
                    key="music_list_admin"
                    style={{ flex: 1 }}
                    data={filteredMusic}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMusicCard}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={true}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="musical-notes-outline" size={60} color="#282828" />
                            <Text style={styles.emptyText}>Nothing here yet.</Text>
                            <Text style={styles.emptySubtext}>
                                {searchQuery || selectedGenre !== 'All' 
                                    ? "No matches found for your search." 
                                    : "Start by uploading your first track!"}
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
            ) : (
                <FlatList
                    key="requests_list_admin"
                    style={{ flex: 1 }}
                    data={requests}
                    keyExtractor={(item) => item.id}
                    renderItem={renderRequestItem}
                    numColumns={1}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={true}
                    ListHeaderComponent={null}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="notifications-off-outline" size={60} color="#282828" />
                            <Text style={styles.emptyText}>Nothing here yet.</Text>
                            <Text style={styles.emptySubtext}>You're all caught up with user requests.</Text>
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
        backgroundColor: '#000000',
    },
    header: {
        marginBottom: 10,
    },
    exploreCard: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        paddingVertical: 12,
        minHeight: 50,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        justifyContent: 'center',
    },
    menuButton: {
        position: 'absolute',
        left: 10,
        width: 34,
        height: 34,
        backgroundColor: '#282828',
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    exploreTextContainer: {
        flex: 1,
    },
    title: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#fff',
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 10,
        fontWeight: '500',
        color: '#1DB954',
        textAlign: 'center',
    },
    headerLogo: {
        position: 'absolute',
        right: 10,
        width: 30,
        height: 30,
        borderRadius: 15,
        zIndex: 10,
        borderWidth: 1.5,
        borderColor: '#1DB954',
    },
    releaseDate: {
        color: '#fff',
        fontSize: 8.5,
        fontStyle: 'italic',
        marginTop: 4,
        textShadowColor: 'rgba(0,0,0,0.9)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },
    tabBar: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    filterSection: {
        paddingHorizontal: 15,
        marginBottom: 10,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E1E',
        borderRadius: 10,
        paddingHorizontal: 12,
        height: 32,
        borderWidth: 1,
        borderColor: '#282828',
        marginBottom: 6,
    },
    searchIcon: {
        marginRight: 8,
    },
    compactSearchInput: {
        flex: 1,
        color: '#fff',
        fontSize: 13,
        padding: 0,
    },
    compactGenreList: {
        paddingRight: 15,
    },
    genreChip: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: '#1E1E1E',
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#282828',
    },
    activeGenreChip: {
        backgroundColor: '#1DB954',
        borderColor: '#1DB954',
    },
    genreText: {
        color: '#666',
        fontSize: 12,
        fontWeight: 'bold',
    },
    activeGenreText: {
        color: '#000',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 7,
        backgroundColor: '#1E1E1E',
        borderRadius: 10,
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
    notifBadge: {
        position: 'absolute',
        top: -6,
        right: -8,
        backgroundColor: '#FF4136',
        borderRadius: 10,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 1.5,
        borderColor: '#000000',
    },
    notifText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
    },
    list: {
        flexGrow: 1,
        paddingBottom: 120,
    },
    musicCard: {
        backgroundColor: '#1E1E1E',
        width: '48%',
        borderRadius: 22,
        marginBottom: 15,
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
        elevation: 18,
        shadowColor: '#1DB954',
        shadowOpacity: 0.6,
        shadowRadius: 15,
        zIndex: 2,
    },
    activeCardOverlay: {
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    inactiveCard: {
        opacity: 0.6,
    },
    thumbnailContainer: {
        position: 'relative',
    },
    trackCover: {
        width: '100%',
        height: 210,
        backgroundColor: '#333',
        position: 'relative',
        overflow: 'hidden',
    },
    cardOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: 15,
        paddingBottom: 15,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderTopLeftRadius: 35,
        borderTopRightRadius: 35,
    },
    playOverlay: {
        position: 'absolute',
        bottom: 15,
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
    visualizerContainer: {
        alignSelf: 'flex-start',
        marginBottom: 8,
        height: 15,
        transform: [{ scale: 0.8 }],
    },
    deleteAction: {
        position: 'absolute',
        top: 8,
        left: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5,
    },
    cardInfo: {
        padding: 0,
    },
    musicTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: 'bold',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
        marginBottom: 6,
    },
    musicArtist: {
        color: '#ccc',
        fontSize: 11,
        marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    artistDot: {
        color: '#1DB954',
        fontSize: 12,
        fontWeight: 'bold',
    },
    cardFooter: {
        marginTop: 4,
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
        marginTop: 4,
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
        color: '#999',
        fontSize: 11,
        fontStyle: 'italic',
        marginTop: 4,
    },
    releaseDate: {
        color: '#999',
        fontSize: 8.5,
        fontStyle: 'italic',
        marginTop: 0,
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
        paddingHorizontal: 40,
        minHeight: 300, // Ensure there's enough height to show it's centered
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
